import { z } from "zod";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { triageRequest, storeAnswer } from "@/core/triage";
import { reflectionRequest } from "@/core/reflection";
import type { Answer } from "@/core/schema";

/**
 * The only place Virtu talks to Jev. Server-side, because the API key must
 * never reach the browser.
 *
 * This is not a proxy. A caller names a TASK and supplies its input; the
 * questions are built here from `src/core`, so the key cannot be spent on
 * arbitrary prompts by whoever finds the URL. Adding a judgment the app can
 * ask for means adding a task below.
 */

const Named = z.object({ slug: z.string(), name: z.string() });

export const JudgeBody = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("triage"),
    text: z.string().min(1).max(2000),
    context: z.object({
      heads: z.array(Named).max(100),
      books: z.array(Named).max(200),
      exercises: z.array(Named.extend({ session: z.string().optional(), bodyweight: z.boolean().optional() })).max(250),
      activities: z.array(Named).max(100),
      metrics: z.array(Named.extend({ unit: z.string() })).max(100),
      projects: z.array(z.string()).max(200),
      unit: z.enum(["kg", "lb"]),
      distanceUnit: z.string(),
    }),
  }),
  z.object({
    task: z.literal("reflection"),
    text: z.string().min(1).max(8000),
    period: z.enum(["day", "week"]),
  }),
]);
export type JudgeBody = z.infer<typeof JudgeBody>;

export interface JudgeResult {
  model: string;
  answers: Record<string, Answer>;
}

export interface Deps {
  client: () => Pick<TypeSafeClient, "systemOne">;
  /** Resolves true when the request may spend the key. */
  authorize: (req: Request) => Promise<boolean>;
}

export function configured(): boolean {
  return !!process.env.TYPESAFE_API_KEY;
}

/** Ask the questions for one task and keep only well-formed answers. */
export async function judge(body: JudgeBody, client: Pick<TypeSafeClient, "systemOne">): Promise<JudgeResult> {
  const { state, questions } = body.task === "triage"
    ? triageRequest(body.text, body.context)
    : reflectionRequest(body.text, body.period);
  const res = await client.systemOne({ state, questions: questions as unknown as Questions });
  const answers: Record<string, Answer> = {};
  for (const [id, a] of Object.entries(res.answers)) {
    const stored = storeAnswer(a);
    if (stored) answers[id] = stored;
  }
  // The versioned id, never the alias: judgments must say which model spoke.
  return { model: res.model, answers };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleJudge(req: Request, deps: Deps): Promise<Response> {
  if (!configured()) return json(501, { error: "Jev is not configured on this server." });
  if (!(await deps.authorize(req))) return json(401, { error: "Sign in to use Jev." });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "Body is not JSON." }); }
  const body = JudgeBody.safeParse(raw);
  if (!body.success) return json(400, { error: body.error.issues[0]?.message ?? "Bad request." });

  try {
    return json(200, await judge(body.data, deps.client()));
  } catch (e) {
    const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 502;
    return json(status === 429 ? 429 : 502, { error: "Jev did not answer." });
  }
}
