import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@/core/schema";
import type { Entity, VEvent } from "./types";

// Sync is out of scope here: no server, so flush() no-ops.
vi.mock("./remote", () => ({
  remote: {
    configured: () => false, signedIn: async () => false,
    pushEvents: async () => {}, pushEntities: async () => {},
    fetchEntities: async () => [], fetchEvents: async () => [], onSignIn: () => () => {},
  },
}));

const { db, setMeta } = await import("./db");
const { log, eventsOfKind, putEntity } = await import("./ledger");
const { judgePending, accept, reject, undoAuto, keep, refile, resetJudgeState, setJevEnabled, triageContext } =
  await import("./judge");
const { buildInbox } = await import("@/core/inbox");

const choice = (c: string, confidence = 0.9): Answer =>
  ({ type: "choice", choice: c, confidence, probabilities: { [c]: confidence } });

type Reply = { status?: number; answers?: Record<string, Answer> };

/** A fake /api/judge that answers from a script, keyed by capture text. */
function fakeJudge(script: (text: string) => Reply) {
  const calls: any[] = [];
  const f = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const r = script(body.text);
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: r.answers ?? {} }), { status: r.status ?? 200 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

const head = (slug: string, name: string): Entity => ({
  id: `head:${slug}`, kind: "head", slug, name, aliases: [], meta: {}, state: {}, ord: 1, archived_at: null,
});

async function inbox() {
  const [c, n, j, v] = await Promise.all([
    eventsOfKind("capture"), eventsOfKind("note"), eventsOfKind("judgment"), eventsOfKind("verdict")]);
  return buildInbox(c, n, j as any, v);
}

beforeEach(async () => {
  await new Promise(r => setTimeout(r, 0));
  for (const s of ["events", "entities", "meta"] as const) await db.clear(s);
  resetJudgeState();
  await putEntity(head("craft", "Craft"));
  await putEntity(head("method", "Method"));
  await setMeta("jev:on", true);
});

describe("judgePending", () => {
  it("does nothing while switched off — nothing leaves the device", async () => {
    await setMeta("jev:on", false);
    await log("capture", { text: "a thought" });
    const { f } = fakeJudge(() => ({}));
    expect(await judgePending({ fetch: f })).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the capture's text and the plan's names, and nothing else", async () => {
    await log("capture", { text: "a thought" });
    await log("set", { exercise: "x", name: "X", weight: 1, reps: 1, unit: "lb" });
    const { f, calls } = fakeJudge(() => ({ answers: { kind: choice("other") } }));
    await judgePending({ fetch: f });
    expect(calls).toHaveLength(1);
    expect(calls[0].task).toBe("triage");
    expect(calls[0].text).toBe("a thought");
    expect(calls[0].context.heads.map((h: any) => h.slug).sort()).toEqual(["craft", "method"]);
    expect(JSON.stringify(calls[0])).not.toContain("weight\":1");
  });

  it("files a confident note automatically, linked to its capture, marked as the agent's", async () => {
    const c = await log("capture", { text: "Structure is the ornament" });
    const { f } = fakeJudge(() => ({ answers: { kind: choice("note", 0.9), head: choice("craft", 0.85) } }));
    expect(await judgePending({ fetch: f })).toBe(1);

    const [n] = await eventsOfKind("note");
    expect(n.payload).toMatchObject({ head: "craft", files: c.client_id });
    expect(n.source).toBe("agent");
    expect(n.occurred_at).toBe(c.occurred_at);
    const [j] = await eventsOfKind("judgment");
    expect(j.payload).toMatchObject({ target: c.client_id, action: "auto", model: "jev-1.13.0" });
    expect((await inbox()).auto).toHaveLength(1);
  });

  it("judges each capture once", async () => {
    await log("capture", { text: "one" });
    const { f } = fakeJudge(() => ({ answers: { kind: choice("other") } }));
    await judgePending({ fetch: f });
    await judgePending({ fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("offers a set without writing it", async () => {
    await log("capture", { text: "squat 65 for 8" });
    await putEntity({ id: "exercise:barbell-squat", kind: "exercise", slug: "barbell-squat", name: "Barbell squat",
                      aliases: [], meta: {}, state: {}, ord: 1, archived_at: null });
    const { f } = fakeJudge(() => ({ answers: {
      kind: choice("set"), exercise: choice("barbell-squat"), weight: choice("n0"), reps: choice("n1"),
    } }));
    await judgePending({ fetch: f });
    expect(await eventsOfKind("set")).toHaveLength(0);
    expect((await inbox()).items[0].state).toBe("suggest");
  });

  it("stops for the session when the server has no key", async () => {
    await log("capture", { text: "one" });
    const { f } = fakeJudge(() => ({ status: 501 }));
    expect(await judgePending({ fetch: f })).toBe(0);
    await judgePending({ fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(await eventsOfKind("judgment")).toHaveLength(0);
  });

  it("a refused or failed call writes nothing and retries next time", async () => {
    await log("capture", { text: "one" });
    const failing = fakeJudge(() => ({ status: 401 }));
    await judgePending({ fetch: failing.f });
    expect(await eventsOfKind("judgment")).toHaveLength(0);
    const working = fakeJudge(() => ({ answers: { kind: choice("other") } }));
    expect(await judgePending({ fetch: working.f })).toBe(1);
  });
});

describe("reading reflections", () => {
  it("reads each line once, records features, proposes nothing", async () => {
    const r = await log("reflection", { text: "Knee sore after rugby.", period: "day" });
    const { f, calls } = fakeJudge(() => ({ answers: {
      energy: { type: "score", score: 1, confidence: 0.8, probabilities: { 1: 0.8 } },
      pain: { type: "noul", noul: 0.93 },
    } }));
    expect(await judgePending({ fetch: f })).toBe(1);
    await judgePending({ fetch: f });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ task: "reflection", text: "Knee sore after rugby.", period: "day" });
    const [j] = await eventsOfKind("judgment");
    expect(j.payload).toMatchObject({ target: r.client_id, task: "reflection", action: "record", proposal: null });
    expect(await eventsOfKind("note")).toHaveLength(0);
  });

  it("a failure on a reflection stops the run before any capture is sent", async () => {
    await log("reflection", { text: "x", period: "day" });
    await log("capture", { text: "y" });
    const { f, calls } = fakeJudge(() => ({ status: 429 }));
    await judgePending({ fetch: f });
    expect(calls).toHaveLength(1);
    expect(await eventsOfKind("judgment")).toHaveLength(0);
  });
});

describe("verdicts", () => {
  async function offeredSet() {
    const c = await log("capture", { text: "squat 65 for 8" }, { occurredAt: new Date("2026-09-01T18:00:00Z") });
    const proposal = {
      kind: "set", confidence: 0.8, complete: true, missing: [],
      payload: { exercise: "barbell-squat", name: "Barbell squat", weight: 65, reps: 8, unit: "lb" },
    };
    const j = await log("judgment", {
      target: c.client_id, task: "triage", model: "jev-1.13.0", answers: {}, proposal, action: "suggest",
    });
    return { c, j };
  }

  it("accepting writes the entry at the capture's time, with its words, and files the capture", async () => {
    const { c, j } = await offeredSet();
    const wrote = await accept(j, c, { ...j.payload!.proposal!.payload, weight: 67.5 });
    const [set] = await eventsOfKind("set");
    expect(set.payload!.weight).toBe(67.5);
    expect(set.occurred_at).toBe(c.occurred_at);
    expect(set.raw).toBe("squat 65 for 8");
    const [v] = await eventsOfKind("verdict");
    expect(v.payload).toEqual({ judgment: j.client_id, target: c.client_id, accepted: true, wrote: wrote.client_id });
    expect((await inbox()).items).toEqual([]);
  });

  it("an amended payload that breaks the schema is refused and nothing is written", async () => {
    const { c, j } = await offeredSet();
    await expect(accept(j, c, { exercise: "x", rep: 8 })).rejects.toThrow(/Refused/);
    expect(await eventsOfKind("set")).toHaveLength(0);
    expect(await eventsOfKind("verdict")).toHaveLength(0);
  });

  it("refusing records a verdict and returns the capture to Commonplace", async () => {
    const { j } = await offeredSet();
    await reject(j);
    expect((await eventsOfKind("verdict"))[0].payload!.accepted).toBe(false);
    expect((await inbox()).items).toEqual([]);
  });

  async function autoNote() {
    const c = await log("capture", { text: "Structure is the ornament" });
    const { f } = fakeJudge(() => ({ answers: { kind: choice("note", 0.9), head: choice("craft", 0.85) } }));
    await judgePending({ fetch: f });
    const [j] = await eventsOfKind("judgment");
    const [n] = await eventsOfKind("note");
    return { c, j, n };
  }

  it("undo strikes the note Jev filed and puts nothing back in the inbox", async () => {
    const { j, n } = await autoNote();
    await undoAuto(j, n as VEvent<"note">);
    expect(await eventsOfKind("note")).toHaveLength(0);
    const box = await inbox();
    expect(box.auto).toEqual([]);
    expect(box.items).toEqual([]);            // refused: it waits in Commonplace
  });

  it("keep and refile both answer the auto-filing", async () => {
    const { j, n } = await autoNote();
    await refile(j, n as VEvent<"note">, { slug: "method", name: "Method" });
    const notes = await eventsOfKind("note");
    expect(notes).toHaveLength(1);
    expect(notes[0].payload).toMatchObject({ head: "method", headName: "Method" });
    expect((await inbox()).auto).toEqual([]);

    const second = await autoNote();
    await keep(second.j, second.n as VEvent<"note">);
    expect((await inbox()).auto).toEqual([]);
  });
});

describe("triageContext", () => {
  it("names exercises with their session, and projects from the task log", async () => {
    await putEntity({ id: "session:push-a", kind: "session", slug: "push-a", name: "Push", aliases: [], meta: {}, state: {}, ord: 1, archived_at: null });
    await putEntity({ id: "exercise:barbell-squat", kind: "exercise", slug: "barbell-squat", name: "Barbell squat",
                      aliases: [], meta: { session: "push-a" }, state: {}, ord: 1, archived_at: null });
    await log("task", { project: "Virtu", step: "a", done: false });
    await log("task", { project: "Virtu", step: "b", done: false });
    const ctx = await triageContext();
    expect(ctx.exercises).toEqual([{ slug: "barbell-squat", name: "Barbell squat", session: "Push", bodyweight: false }]);
    expect(ctx.projects).toEqual(["Virtu"]);
  });
});

describe("setJevEnabled", () => {
  it("persists the choice", async () => {
    await setJevEnabled(false);
    const { jevEnabled } = await import("./judge");
    expect(await jevEnabled()).toBe(false);
  });
});
