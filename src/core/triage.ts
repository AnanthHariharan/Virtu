import type { Answer, Proposal } from "./schema";
import { parsePayload } from "./schema";

/**
 * Capture triage: what a line typed into the + button was meant to be.
 *
 * This is System One's pattern, applied to the ledger. Code owns the control
 * flow; the model makes only narrow, typed judgments, all of them asked at
 * once over the same small state (speculative fan-out), and code composes
 * the answers into a proposal gated by confidence:
 *
 *   - A NOTE may be filed automatically. The worst case is a learning under
 *     the wrong head, visible and undoable in the inbox.
 *   - Anything that moves a figure — a set, a measure, minutes, pages — is
 *     only ever OFFERED. It feeds records and trends; you confirm it.
 *   - Below the floor, nothing is proposed and the capture waits for you.
 *
 * Numbers are never generated. Code finds every number in the text with a
 * regular expression and the model only chooses which candidate is the
 * weight, which the reps — so every figure written is one you typed.
 *
 * Pure: no browser, no database, no network. The questions are built here
 * and sent by the server route; the answers come back and are decided here.
 */

/* ── the context a triage is judged against ─────────────────────────── */

export interface Named { slug: string; name: string }

export interface TriageContext {
  heads: Named[];
  books: Named[];
  exercises: (Named & { session?: string; bodyweight?: boolean })[];
  activities: Named[];
  metrics: (Named & { unit: string })[];
  projects: string[];
  /** Label for free-weight figures, from src/data/program. */
  unit: "kg" | "lb";
  distanceUnit: string;
}

/* ── number candidates ─────────────────────────────────────────────── */

export interface Candidate {
  /** Question-safe key: n0, n1, … */
  key: string;
  value: number;
  unit: string | null;
  /** The words around it, so the model can tell a weight from a rep. */
  context: string;
}

/**
 * A number, and a unit only when the unit ends the word — so "2 hard sets"
 * is not two hours, and "3x10" yields both the 3 and the 10.
 */
const NUM = /(\d+(?:\.\d+)?)(?:\s*(kg|lbs?|mi|km|minutes?|mins?|hours?|hrs?|h|m|pages?|pp|p|bpm|x|×|s|′)(?=$|[^\w]))?/gi;

/** Every number in the text, with its unit if it carries one. At most twelve. */
export function numberCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(NUM)) {
    if (out.length >= 12) break;
    const i = m.index ?? 0;
    const unit = m[2] ? m[2].toLowerCase() : null;
    const from = Math.max(0, i - 24);
    const to = Math.min(text.length, i + m[0].length + 24);
    out.push({
      key: `n${out.length}`,
      value: Number(m[1]),
      unit,
      context: text.slice(from, to).trim(),
    });
  }
  return out;
}

/** A duration candidate in minutes: "1h" is sixty, "90" is ninety. */
export function asMinutes(c: Candidate): number {
  return c.unit && /^(h|hrs?|hours?)$/.test(c.unit) ? c.value * 60 : c.value;
}

/* ── the questions ─────────────────────────────────────────────────── */

type Criteria = Record<string, unknown>;
export interface Q { type: "choice" | "score" | "noul"; instructions: unknown; criteria?: unknown }

/** The kinds a capture can become, with contrastive descriptions. */
export const KIND_CRITERIA: Criteria = {
  note: {
    what: "An insight, lesson, idea or quotation worth keeping",
    not_for: "Something done, eaten or measured today",
    examples: ["Structure is the ornament", "Habits are votes for the person you want to be"],
  },
  task: {
    what: "Something I intend to do: a to-do, or a step in a project",
    not_for: "Something already done",
    examples: ["email the landlord about the lease", "draft the intro for the essay"],
  },
  set: {
    what: "A weight-training set: an exercise with a weight and/or repetitions",
    not_for: "Sport, running, yoga or other activity measured in time",
    examples: ["bench 30s 3x10", "squat 65 for 8, felt heavy"],
  },
  activity: {
    what: "Sport or cardio done, measured in time: cricket, rugby, yoga, running",
    not_for: "Lifting weights",
    examples: ["ran 3 miles easy in 28 min", "nets for an hour"],
  },
  measure: {
    what: "A number about my body: body weight, hours slept, resting pulse",
    not_for: "Weight lifted in the gym",
    examples: ["weighed 71.2 this morning", "slept 6.5h"],
  },
  read: {
    what: "Pages read in a book",
    not_for: "A thought about a book, with no pages",
    examples: ["read gita p 10 to 24"],
  },
  other: {
    what: "Anything else: a feeling, an event, a reminder of the day",
    not_for: "Anything that fits one of the other options",
    examples: ["long day, tired", "saw an old friend at the station"],
  },
};

export const TRIAGE_KINDS = Object.keys(KIND_CRITERIA);

const none = (what: string) => ({ none: what });
const bySlug = (xs: Named[], describe: (x: Named) => unknown = x => x.name) =>
  Object.fromEntries(xs.map(x => [x.slug, describe(x)]));

function pick(candidates: Candidate[], question: string, absent: string): Q {
  return {
    type: "choice",
    instructions: question,
    criteria: {
      ...Object.fromEntries(candidates.map(c => [
        c.key, { number: c.value, unit: c.unit, in: c.context },
      ])),
      ...none(absent),
    },
  };
}

/**
 * The whole request for one capture. Every question is asked every time —
 * a question whose answer turns out not to matter costs a few tokens and
 * saves a round trip. State is only the capture and the day: the least a
 * judgment needs, and the least that leaves the device.
 */
export function triageRequest(text: string, ctx: TriageContext, now = new Date()) {
  const cands = numberCandidates(text);
  const state = {
    capture: text,
    day: now.toLocaleDateString("en-GB", { weekday: "long" }),
  };

  const questions: Record<string, Q> = {
    kind: {
      type: "choice",
      instructions: {
        question: "What kind of entry is `capture`?",
        focus: "Classify what the person was recording, not every topic mentioned.",
      },
      criteria: KIND_CRITERIA,
    },
    happened: {
      type: "noul",
      instructions: "`capture` describes something that has already happened, not a plan or an idea.",
    },
  };

  if (ctx.heads.length) {
    questions.head = {
      type: "choice",
      instructions: "If `capture` were kept as a learning, under which head of a commonplace book would it be filed?",
      criteria: { ...bySlug(ctx.heads), ...none("It fits none of these heads") },
    };
  }
  if (ctx.books.length) {
    questions.book = {
      type: "choice",
      instructions: "Which book, if any, does `capture` come from or refer to?",
      criteria: { ...bySlug(ctx.books), ...none("No book, or a book not in this list") },
    };
  }
  if (ctx.exercises.length) {
    questions.exercise = {
      type: "choice",
      instructions: "Which gym exercise, if any, does `capture` record?",
      criteria: {
        ...bySlug(ctx.exercises, x => (x as TriageContext["exercises"][number]).session
          ? { name: x.name, session: (x as TriageContext["exercises"][number]).session } : x.name),
        ...none("No gym exercise, or one not in this list"),
      },
    };
  }
  if (ctx.activities.length) {
    questions.activity = {
      type: "choice",
      instructions: "Which sport or activity, if any, does `capture` record?",
      criteria: { ...bySlug(ctx.activities), ...none("No sport or activity in this list") },
    };
  }
  if (ctx.metrics.length) {
    questions.metric = {
      type: "choice",
      instructions: "Which body measurement, if any, does `capture` record?",
      criteria: {
        ...bySlug(ctx.metrics, x => `${x.name}, in ${(x as TriageContext["metrics"][number]).unit}`),
        ...none("No body measurement"),
      },
    };
  }
  questions.project = {
    type: "choice",
    instructions: "If `capture` is something to do, which project does it belong to?",
    criteria: {
      ...Object.fromEntries(ctx.projects.slice(0, 200).map((p, i) => [`p${i}`, p])),
      ...none("None of these projects, or it is not something to do"),
    },
  };

  if (cands.length) {
    questions.weight = pick(cands, "Which number in `capture` is the weight lifted?", "No weight lifted is given");
    questions.reps = pick(cands, "Which number in `capture` is the number of repetitions in a set?", "No repetitions are given");
    questions.minutes = pick(cands, "Which number in `capture` is how long an activity lasted?", "No duration is given");
    questions.distance = pick(cands, "Which number in `capture` is a distance travelled?", "No distance is given");
    questions.value = pick(cands, "Which number in `capture` is the body measurement's value?", "No body measurement is given");
    questions.from = pick(cands, "Which number in `capture` is the page where reading began?", "No starting page is given");
    questions.to = pick(cands, "Which number in `capture` is the page where reading stopped?", "No final page is given");
  }

  return { state, questions, candidates: cands };
}

/* ── deciding ──────────────────────────────────────────────────────── */

/**
 * Thresholds live in code, where they can be tuned against your verdicts.
 * Raising `autoNote` files fewer notes without asking; lowering `floor`
 * offers more guesses.
 */
export const GATES = {
  floor: 0.5,
  autoNote: { kind: 0.8, head: 0.7 },
  /** Below this a Choice about one field is treated as unanswered. */
  field: 0.4,
  /** Below this, a set or a measure reads as a plan and is not offered. */
  happened: 0.3,
};

/** Kinds that move a figure — records, volume, trends — and so are never filed unasked. */
const FIGURE_KINDS = new Set(["set", "activity", "measure", "read"]);

type Answers = Record<string, Answer | undefined>;

function chosen(a: Answer | undefined, gate = GATES.field): string | null {
  if (!a || a.type !== "choice") return null;
  if (a.choice === "none" || a.confidence < gate) return null;
  return a.choice;
}

const conf = (a: Answer | undefined) =>
  !a ? 1 : a.type === "noul" ? Math.max(a.noul, 1 - a.noul) : a.confidence;

export interface Decision {
  proposal: Proposal | null;
  action: "auto" | "suggest" | "leave";
}

/** Compose Jev's answers into one proposal, or none. Pure and deterministic. */
export function decideTriage(
  capture: { client_id: string; text: string },
  ctx: TriageContext,
  candidates: Candidate[],
  answers: Answers,
): Decision {
  const kindA = answers.kind;
  if (!kindA || kindA.type !== "choice" || kindA.confidence < GATES.floor || kindA.choice === "other") {
    return { proposal: null, action: "leave" };
  }
  const kind = kindA.choice;
  const num = (q: string) => {
    const k = chosen(answers[q]);
    return k ? candidates.find(c => c.key === k) ?? null : null;
  };
  const used: (Answer | undefined)[] = [kindA];
  const missing: string[] = [];
  const need = <T,>(v: T | null | undefined, name: string, a?: Answer): T | undefined => {
    if (v === null || v === undefined) { missing.push(name); return undefined; }
    if (a) used.push(a);
    return v;
  };

  let payload: Record<string, unknown>;

  switch (kind) {
    case "note": {
      const head = ctx.heads.find(h => h.slug === chosen(answers.head));
      const book = ctx.books.find(b => b.slug === chosen(answers.book));
      if (head) used.push(answers.head);
      payload = {
        text: capture.text,
        head: head?.slug ?? null, headName: head?.name ?? null,
        source: book?.slug ?? null, sourceName: book?.name ?? null,
        files: capture.client_id,
      };
      break;
    }
    case "task": {
      const k = chosen(answers.project);
      const project = k && k.startsWith("p") ? ctx.projects[Number(k.slice(1))] : undefined;
      if (project) used.push(answers.project);
      payload = { project: project ?? "Unsorted", step: capture.text, done: false };
      break;
    }
    case "set": {
      const ex = need(ctx.exercises.find(e => e.slug === chosen(answers.exercise)), "exercise", answers.exercise);
      const reps = need(num("reps"), "reps", answers.reps);
      const w = num("weight");
      if (w) used.push(answers.weight);
      else if (!ex?.bodyweight) missing.push("weight");
      payload = {
        exercise: ex?.slug, name: ex?.name,
        weight: w?.value ?? 0, reps: reps?.value, unit: ctx.unit,
        ...(ex?.session ? { session: ex.session } : {}),
      };
      break;
    }
    case "activity": {
      const a = need(ctx.activities.find(x => x.slug === chosen(answers.activity)), "activity", answers.activity);
      const m = need(num("minutes"), "minutes", answers.minutes);
      const d = num("distance");
      payload = {
        activity: a?.slug, name: a?.name,
        minutes: m ? asMinutes(m) : undefined,
        ...(d ? { distance: d.value, distanceUnit: d.unit === "km" ? "km" : ctx.distanceUnit } : {}),
      };
      break;
    }
    case "measure": {
      const m = need(ctx.metrics.find(x => x.slug === chosen(answers.metric)), "metric", answers.metric);
      const v = need(num("value"), "value", answers.value);
      payload = { metric: m?.slug, name: m?.name, value: v?.value, unit: m?.unit };
      break;
    }
    case "read": {
      const b = need(ctx.books.find(x => x.slug === chosen(answers.book)), "book", answers.book);
      const from = need(num("from"), "from", answers.from);
      const to = need(num("to"), "to", answers.to);
      payload = { book: b?.slug, name: b?.name, from: from?.value, to: to?.value };
      break;
    }
    default:
      return { proposal: null, action: "leave" };
  }

  // Drop undefined keys, so a complete payload is exactly what the schema wants.
  payload = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  const complete = missing.length === 0 && parsePayload(kind, payload).ok;
  const confidence = Math.min(...used.map(conf));

  const proposal: Proposal = { kind, payload, confidence, complete, missing };

  // A plan is not a set: "squat 100 next week" must not be offered as one.
  // Figures are only ever offered for what has already happened.
  const happened = answers.happened?.type === "noul" ? answers.happened.noul : undefined;
  if (happened !== undefined && FIGURE_KINDS.has(kind) && happened < GATES.happened) {
    return { proposal, action: "leave" };
  }

  if (kind === "note" && complete
      && kindA.confidence >= GATES.autoNote.kind
      && payload.head && answers.head?.type === "choice" && answers.head.confidence >= GATES.autoNote.head) {
    return { proposal, action: "auto" };
  }
  return { proposal, action: "suggest" };
}

/** Strip an API answer to the stored shape (drops the Score legend). */
export function storeAnswer(a: unknown): Answer | null {
  const x = a as Record<string, unknown> | null;
  if (!x || typeof x !== "object") return null;
  if (x.type === "choice") return { type: "choice", choice: String(x.choice), confidence: Number(x.confidence), probabilities: x.probabilities as Record<string, number> };
  if (x.type === "score") return { type: "score", score: Number(x.score), confidence: Number(x.confidence), probabilities: x.probabilities as Record<string, number> };
  if (x.type === "noul") return { type: "noul", noul: Number(x.noul) };
  return null;
}

/** A one-line reading of a proposal, for the inbox. */
export function describeProposal(p: Proposal): string {
  const x = p.payload as Record<string, any>;
  switch (p.kind) {
    case "note": return x.headName ? `Note · ${x.headName}` : "Note · no head";
    case "task": return `Task · ${x.project}`;
    case "set": return `Set · ${x.name ?? "?"} · ${x.weight ? `${x.weight} × ` : ""}${x.reps ?? "?"}`;
    case "activity": return `Activity · ${x.name ?? "?"} · ${x.minutes ?? "?"} min`;
    case "measure": return `Measure · ${x.name ?? "?"} · ${x.value ?? "?"} ${x.unit ?? ""}`.trim();
    case "read": return `Read · ${x.name ?? "?"} · p. ${x.from ?? "?"}–${x.to ?? "?"}`;
    default: return p.kind;
  }
}
