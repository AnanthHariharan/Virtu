import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { handleJudge, type Deps } from "./jev-server";
import type { TriageContext } from "@/core/triage";

const context: TriageContext = {
  heads: [{ slug: "craft", name: "Craft" }], books: [], exercises: [], activities: [],
  metrics: [], projects: [], unit: "lb", distanceUnit: "mi",
};

/**
 * The real SDK client over a fake fetch — so what is under test is the
 * request the SDK actually sends and the response it actually parses.
 */
function sdkWith(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  return new TypeSafeClient({ apiKey: "test-key", fetch: fetchImpl, retry: { maxRetries: 0 }, logLevel: "off" });
}

const ok = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});

const post = (body: unknown) => new Request("http://localhost/api/judge", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
});

const JEV_RESPONSE = {
  model: "jev-1.13.0",
  answers: {
    kind: { type: "choice", choice: "note", confidence: 0.9, probabilities: { note: 0.95, other: 0.05 } },
    happened: { type: "noul", noul: 0.2 },
    head: { type: "choice", choice: "craft", confidence: 0.8, probabilities: { craft: 0.9, none: 0.1 } },
  },
  usage: { input_tokens: 400, output_tokens: 20 },
};

describe("handleJudge", () => {
  let sent: { url: string; body: any; auth: string | null }[];
  let deps: Deps;

  beforeEach(() => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    sent = [];
    deps = {
      authorize: async () => true,
      client: () => sdkWith(async (url, init) => {
        sent.push({
          url, body: JSON.parse(String(init?.body)),
          auth: new Headers(init?.headers).get("authorization"),
        });
        return ok(JEV_RESPONSE);
      }),
    };
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("answers 501 when no key is configured, without calling Jev", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const res = await handleJudge(post({ task: "triage", text: "x", context }), deps);
    expect(res.status).toBe(501);
    expect(sent).toHaveLength(0);
  });

  it("answers 401 to a caller who may not spend the key", async () => {
    const res = await handleJudge(post({ task: "triage", text: "x", context }), { ...deps, authorize: async () => false });
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("refuses a body that is not a known task — it is not a proxy", async () => {
    for (const body of ["not json", { task: "anything", state: "x", questions: {} }, { task: "triage", text: "", context }]) {
      const res = await handleJudge(post(body), deps);
      expect(res.status).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });

  it("sends the capture as state and the questions built in core, through the SDK", async () => {
    const res = await handleJudge(post({ task: "triage", text: "Structure is the ornament", context }), deps);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/systemone$/);
    expect(sent[0].auth).toBe("Bearer test-key");
    expect(sent[0].body.state).toMatchObject({ capture: "Structure is the ornament" });
    expect(Object.keys(sent[0].body.questions)).toEqual(expect.arrayContaining(["kind", "happened", "head", "project"]));
    expect(sent[0].body.model).toBeTruthy();
  });

  it("returns the versioned model and the answers in the stored shape", async () => {
    const res = await handleJudge(post({ task: "triage", text: "x", context }), deps);
    const body = await res.json();
    expect(body.model).toBe("jev-1.13.0");
    expect(body.answers.kind).toEqual(JEV_RESPONSE.answers.kind);
    expect(body.answers.happened).toEqual({ type: "noul", noul: 0.2 });
  });

  it("passes a rate limit through as 429 and anything else as 502", async () => {
    const limited: Deps = { ...deps, client: () => sdkWith(async () => new Response("{}", { status: 429 })) };
    expect((await handleJudge(post({ task: "triage", text: "x", context }), limited)).status).toBe(429);
    const broken: Deps = { ...deps, client: () => sdkWith(async () => new Response("{}", { status: 500 })) };
    expect((await handleJudge(post({ task: "triage", text: "x", context }), broken)).status).toBe(502);
  });
});
