import { gateAction, type Gates } from "./triage";
import type { Answer, Proposal } from "./schema";

/**
 * The lab: how far to trust Jev, measured against you.
 *
 * Jev's probabilities are trained to be calibrated — of the answers given
 * at 0.8, about eight in ten should be right. That is a claim about groups
 * of answers, and it can only be checked against ground truth. Here the
 * ground truth is your verdicts: every proposal you accepted, amended,
 * refiled, undid or refused is a label, written as a side effect of using
 * the inbox. This file turns those labels into the three things you need to
 * set a threshold honestly:
 *
 *   - a reliability table: stated confidence against observed accuracy,
 *     and the expected calibration error (ECE) that summarises it;
 *   - a sweep: at each threshold, how much would be acted on, and how much
 *     of that would have been right;
 *   - a replay: under a different set of gates, which past decisions would
 *     have come out differently.
 *
 * Pure: no browser, no database.
 */

interface Row<P> {
  client_id: string;
  recorded_at: string;
  payload: P | null;
}

type J = Row<{ target: string; task: string; model: string; answers: Record<string, Answer>; proposal: Proposal | null; action: string }>;
type V = Row<{ judgment: string; target: string; accepted: boolean; wrote?: string }>;
type E = Row<Record<string, unknown>>;

export interface Example {
  /** "proposal", or the question id a field came from. */
  question: string;
  confidence: number;
  correct: boolean;
  model: string;
  kind: string;
  action: string;
}

/** Which question produced which field of a proposal. */
export const FIELD_QUESTION: Record<string, string> = {
  head: "head", source: "book", book: "book", exercise: "exercise", activity: "activity",
  metric: "metric", project: "project",
  weight: "weight", reps: "reps", minutes: "minutes", distance: "distance",
  value: "value", from: "from", to: "to",
};

const confOf = (a: Answer | undefined) =>
  !a ? undefined : a.type === "noul" ? Math.max(a.noul, 1 - a.noul) : a.confidence;

/**
 * Labels from verdicts.
 *
 * Proposal level: right if it was accepted exactly as proposed (or, for a
 * note filed on its own, kept as filed); wrong if refused, undone, amended
 * or refiled. Field level — only where a verdict wrote something to compare
 * against: each field Jev chose is right if what was finally written kept it.
 */
export function examples(judgments: J[], verdicts: V[], events: E[]): { proposals: Example[]; fields: Example[] } {
  const byId = new Map(events.map(e => [e.client_id, e]));
  const verdictFor = new Map<string, V>();
  for (const v of verdicts) {
    const cur = v.payload && verdictFor.get(v.payload.judgment);
    if (v.payload && (!cur || v.recorded_at > cur.recorded_at)) verdictFor.set(v.payload.judgment, v);
  }

  const proposals: Example[] = [];
  const fields: Example[] = [];

  for (const j of judgments) {
    const jp = j.payload;
    if (!jp || jp.task !== "triage" || !jp.proposal) continue;
    const v = verdictFor.get(j.client_id)?.payload;
    if (!v) continue;                              // unanswered: no label yet
    const p = jp.proposal;
    const wrote = v.wrote ? byId.get(v.wrote)?.payload : undefined;

    const unchanged = !!wrote && Object.entries(p.payload).every(([k, x]) => sameValue(wrote[k], x));
    const correct = v.accepted && (wrote ? unchanged : true);
    const base = { model: jp.model, kind: p.kind, action: jp.action };
    proposals.push({ question: "proposal", confidence: p.confidence, correct, ...base });

    if (!wrote) continue;
    for (const [field, q] of Object.entries(FIELD_QUESTION)) {
      if (!(field in p.payload)) continue;
      const c = confOf(jp.answers[q]);
      if (c === undefined) continue;
      fields.push({ question: q, confidence: c, correct: sameValue(wrote[field], p.payload[field]), ...base });
    }
  }
  return { proposals, fields };
}

const sameValue = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b;

/* ── reliability ───────────────────────────────────────────────────── */

export interface Bin { from: number; to: number; n: number; confidence: number; accuracy: number }

export const EDGES = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** Stated confidence against observed accuracy, per bin. Empty bins are dropped. */
export function reliability(xs: Example[], edges = EDGES): Bin[] {
  const bins: Bin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const last = i === edges.length - 2;
    const inBin = xs.filter(x => x.confidence >= lo && (last ? x.confidence <= hi : x.confidence < hi));
    if (!inBin.length) continue;
    bins.push({
      from: lo, to: hi, n: inBin.length,
      confidence: mean(inBin.map(x => x.confidence)),
      accuracy: inBin.filter(x => x.correct).length / inBin.length,
    });
  }
  return bins;
}

/** Expected calibration error: the count-weighted gap between saying and being right. */
export function ece(bins: Bin[]): number | null {
  const n = bins.reduce((s, b) => s + b.n, 0);
  if (!n) return null;
  return bins.reduce((s, b) => s + (b.n / n) * Math.abs(b.accuracy - b.confidence), 0);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ── thresholds ────────────────────────────────────────────────────── */

export interface Point { threshold: number; n: number; coverage: number; precision: number | null }

/** At each threshold: how many would be acted on, what share, and how many of those were right. */
export function sweep(xs: Example[], thresholds = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]): Point[] {
  return thresholds.map(t => {
    const over = xs.filter(x => x.confidence >= t);
    return {
      threshold: t,
      n: over.length,
      coverage: xs.length ? over.length / xs.length : 0,
      precision: over.length ? over.filter(x => x.correct).length / over.length : null,
    };
  });
}

/**
 * The lowest threshold whose precision meets the target with enough
 * evidence behind it — the most you can act on without asking, at the
 * error rate you chose. Null until the ledger has enough labels to say.
 */
export function suggestThreshold(points: Point[], target = 0.9, minN = 10): number | null {
  const ok = points.filter(p => p.n >= minN && p.precision !== null && p.precision >= target);
  return ok.length ? Math.min(...ok.map(p => p.threshold)) : null;
}

/* ── replay ────────────────────────────────────────────────────────── */

export interface Replay {
  total: number;
  changed: { client_id: string; target: string; from: string; to: string }[];
}

/** Every stored triage judgment, decided again under `gates`. Nothing is written. */
export function replay(judgments: J[], gates: Gates): Replay {
  const changed: Replay["changed"] = [];
  let total = 0;
  for (const j of judgments) {
    const jp = j.payload;
    if (!jp || jp.task !== "triage" || !jp.proposal) continue;
    total++;
    const to = gateAction(jp.proposal, jp.answers, gates);
    if (to !== jp.action) changed.push({ client_id: j.client_id, target: jp.target, from: jp.action, to });
  }
  return { total, changed };
}
