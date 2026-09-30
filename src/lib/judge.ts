"use client";

import { entities, eventsOfKind, log, logUntrusted, correct, strike, subscribe } from "./ledger";
import { getMeta, setMeta } from "./db";
import { supabase } from "./supabase";
import { decideTriage, numberCandidates, mergeGates, type Gates, type TriageContext } from "@/core/triage";
import { buildInbox, type Judgment } from "@/core/inbox";
import { captureText } from "@/core/commonplace";
import { ACTIVITIES, DISTANCE_UNIT } from "@/data/activities";
import { UNIT } from "@/data/program";
import type { Answer } from "@/core/schema";
import type { VEvent, Payload } from "./types";

/**
 * The client half of triage. Local-first rules still hold: a capture is
 * written and returned from `log()` long before anyone judges it, and a
 * judgment is just another event written through `log()` when the network
 * and the server are both willing. Nothing here blocks a write.
 *
 * Off until switched on in Settings: triage sends the capture's text to
 * TypeSafe, and that is your decision, not a default.
 */

export const JEV_KEY = "jev:on";
export const GATES_KEY = "lab:gates";

/** The gates in force: the defaults in core, with any tuned in the lab. */
export const currentGates = async (): Promise<Gates> => mergeGates(await getMeta<unknown>(GATES_KEY, null));
export const setGates = (g: Gates | null) => setMeta(GATES_KEY, g);

export const jevEnabled = () => getMeta<boolean>(JEV_KEY, false);
export async function setJevEnabled(on: boolean) {
  await setMeta(JEV_KEY, on);
  if (on) void judgePending();
}

/** What a capture is judged against: the plan, as it stands on this device. */
export async function triageContext(): Promise<TriageContext> {
  const [heads, books, exercises, sessions, metrics, tasks] = await Promise.all([
    entities("head"), entities("book"), entities("exercise"), entities("session"),
    entities("metric"), eventsOfKind("task"),
  ]);
  const sessionName = new Map(sessions.map(s => [s.slug, s.name]));
  return {
    heads: heads.map(h => ({ slug: h.slug, name: h.name })),
    books: books.map(b => ({ slug: b.slug, name: b.name })),
    exercises: exercises.map(e => ({
      slug: e.slug, name: e.name,
      session: sessionName.get(e.meta?.session) ?? undefined,
      bodyweight: !!e.meta?.bodyweight,
    })),
    activities: ACTIVITIES.map(a => ({ slug: a.slug, name: a.name })),
    metrics: metrics.map(m => ({ slug: m.slug, name: m.name, unit: String(m.meta?.unit ?? "") })),
    projects: [...new Set(tasks.map(t => t.payload?.project).filter(Boolean) as string[])],
    unit: UNIT,
    distanceUnit: DISTANCE_UNIT,
  };
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
  } catch {
    return {};
  }
}

let running = false;
/** Set when the server says Jev is not configured; retried on next app open. */
let unavailable = false;

export function resetJudgeState() { running = false; unavailable = false; }

/**
 * Judge captures and read reflections that have not been. Safe to call
 * constantly, like `flush()`: it no-ops when switched off, offline,
 * unconfigured, or running. Returns how many entries were judged.
 */
export async function judgePending(opts: { fetch?: typeof fetch; limit?: number } = {}): Promise<number> {
  if (running || unavailable) return 0;
  if (!(await jevEnabled())) return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const f = opts.fetch ?? fetch;
  running = true;
  try {
    const [captures, notes, judgments, verdicts] = await Promise.all([
      eventsOfKind("capture"), eventsOfKind("note"), eventsOfKind("judgment"), eventsOfKind("verdict"),
    ]);
    const { items } = buildInbox(captures, notes, judgments as Judgment[], verdicts);
    const todo = items.filter(i => i.state === "waiting").slice(0, opts.limit ?? 10);

    // Reflections are read for features — energy, mood, pain — and nothing
    // is proposed from them. Each is read once.
    const read = new Set(judgments.filter(j => j.payload?.task === "reflection").map(j => j.payload!.target));
    const lines = (await eventsOfKind("reflection")).filter(r => !read.has(r.client_id)).slice(0, opts.limit ?? 10);
    if (!todo.length && !lines.length) return 0;

    const context = await triageContext();
    const gates = await currentGates();
    const headers = { "content-type": "application/json", ...(await authHeader()) };
    let n = 0;
    let stop = false;

    /** One request. Returns the answers, or null to stop this run. */
    const ask = async (body: unknown) => {
      let res: Response;
      try {
        res = await f("/api/judge", { method: "POST", headers, body: JSON.stringify(body) });
      } catch {
        return null;                               // offline mid-run; next trigger resumes
      }
      if (res.status === 501) { unavailable = true; return null; }
      if (!res.ok) return null;                    // 401, 429, 5xx: try again later
      return await res.json() as { model: string; answers: Record<string, Answer> };
    };

    for (const r of lines) {
      const got = await ask({ task: "reflection", text: r.payload!.text, period: r.payload!.period });
      if (!got) { stop = true; break; }
      await log("judgment", {
        target: r.client_id, task: "reflection", model: got.model, answers: got.answers,
        proposal: null, action: "record",
      }, { source: "agent" });
      n++;
    }

    for (const { capture } of stop ? [] : todo) {
      const text = captureText(capture);
      const got = await ask({ task: "triage", text, context });
      if (!got) break;
      const { model, answers } = got;
      const d = decideTriage({ client_id: capture.client_id, text }, context, numberCandidates(text), answers, gates);
      await log("judgment", {
        target: capture.client_id, task: "triage", model, answers,
        proposal: d.proposal, action: d.action,
      }, { source: "agent" });

      // Only a note is ever filed without asking. It lands at the capture's
      // time, marked as the agent's, and is undoable from the inbox.
      if (d.action === "auto" && d.proposal) {
        await logUntrusted("note", d.proposal.payload, {
          source: "agent", raw: text, occurredAt: new Date(capture.occurred_at),
        });
      }
      n++;
    }
    return n;
  } finally {
    running = false;
  }
}

/**
 * Accept a proposal — possibly as amended — and record the verdict. The
 * entry lands at the capture's time, with the capture's words as `raw`.
 */
export async function accept(j: VEvent<"judgment">, capture: VEvent<"capture">, payload?: Record<string, unknown>) {
  const p = j.payload!.proposal!;
  const wrote = await logUntrusted(p.kind, payload ?? p.payload, {
    raw: captureText(capture), occurredAt: new Date(capture.occurred_at),
  });
  await log("verdict", {
    judgment: j.client_id, target: capture.client_id, accepted: true, wrote: wrote.client_id,
  });
  return wrote;
}

/** Refuse a proposal. The capture goes back to Commonplace to be filed by hand. */
export async function reject(j: VEvent<"judgment">) {
  await log("verdict", { judgment: j.client_id, target: j.payload!.target, accepted: false });
}

/** Undo a note Jev filed on its own: strike the note, record the refusal. */
export async function undoAuto(j: VEvent<"judgment">, note: VEvent<"note">) {
  await strike(note);
  await reject(j);
}

/** Keep a note Jev filed on its own, as filed. The verdict is the label. */
export async function keep(j: VEvent<"judgment">, note: VEvent<"note">) {
  await log("verdict", {
    judgment: j.client_id, target: j.payload!.target, accepted: true, wrote: note.client_id,
  });
}

/** Refile an auto-filed note under a different head, keeping it filed. */
export async function refile(j: VEvent<"judgment">, note: VEvent<"note">, head: { slug: string; name: string }) {
  const fixed = await correct(note, { ...(note.payload as Payload<"note">), head: head.slug, headName: head.name });
  // `wrote` names the correction — what now stands — so the lab can see
  // that the head was the part Jev got wrong.
  await log("verdict", {
    judgment: j.client_id, target: j.payload!.target, accepted: false, wrote: fixed.client_id,
  });
}

/**
 * Judge on the same moments the sync loop drains: app open, focus, coming
 * online — and shortly after any write, so a capture is triaged while you
 * are still looking at it.
 */
export function startJudging(): () => void {
  const go = () => { void judgePending(); };
  let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(t); t = setTimeout(go, 1500); };
  window.addEventListener("online", go);
  window.addEventListener("focus", go);
  const un = subscribe(soon);
  go();
  return () => {
    clearTimeout(t);
    un();
    window.removeEventListener("online", go);
    window.removeEventListener("focus", go);
  };
}

