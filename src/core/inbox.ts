import { unfiledCaptures } from "./commonplace";
import type { Proposal } from "./schema";

/**
 * The triage inbox, read back from the ledger.
 *
 * Nothing here is stored as state. Which captures wait, what Jev proposed
 * for each, what it filed on its own, and what you accepted or refused are
 * all folded from four kinds of event: capture, note, judgment, verdict.
 *
 * Pure: no browser, no database.
 */

interface Row<P> {
  client_id: string;
  occurred_at: string;
  recorded_at: string;
  raw: string | null;
  payload: P | null;
}

type Capture = Row<{ text: string }>;
type Note = Row<{ text: string; files?: string }>;
export type Judgment = Row<{
  target: string; task: string; model: string;
  proposal: Proposal | null; action: "auto" | "suggest" | "leave";
  answers: Record<string, unknown>;
}>;
type Verdict = Row<{ judgment: string; target: string; accepted: boolean; wrote?: string }>;

export type ItemState = "waiting" | "suggest" | "incomplete" | "unclear";

export interface InboxItem<C> {
  capture: C;
  judgment: Judgment | null;
  state: ItemState;
}

export interface AutoFiled<C, N> {
  capture: C | undefined;
  judgment: Judgment;
  note: N;
}

/** Captures a verdict accepted as some entry — filed, whatever the kind. */
export function acceptedTargets(verdicts: Verdict[]): Set<string> {
  return new Set(verdicts.filter(v => v.payload?.accepted).map(v => v.payload!.target));
}

/** The most recent triage judgment for each capture. */
export function latestJudgments(judgments: Judgment[]): Map<string, Judgment> {
  const m = new Map<string, Judgment>();
  for (const j of judgments) {
    if (j.payload?.task !== "triage") continue;
    const cur = m.get(j.payload.target);
    if (!cur || j.recorded_at > cur.recorded_at) m.set(j.payload.target, j);
  }
  return m;
}

export function buildInbox<C extends Capture, N extends Note>(
  captures: C[], notes: N[], judgments: Judgment[], verdicts: Verdict[],
): { items: InboxItem<C>[]; auto: AutoFiled<C, N>[]; judged: Set<string> } {
  const latest = latestJudgments(judgments);
  const refused = new Set(verdicts.filter(v => v.payload && !v.payload.accepted).map(v => v.payload!.judgment));
  const answered = new Set(verdicts.map(v => v.payload?.judgment).filter(Boolean) as string[]);

  const open = unfiledCaptures(captures, notes, acceptedTargets(verdicts));
  const items: InboxItem<C>[] = [];
  for (const c of open) {
    const j = latest.get(c.client_id) ?? null;
    // A refused proposal goes back to Commonplace to be filed by hand.
    if (j && refused.has(j.client_id)) continue;
    const p = j?.payload;
    const state: ItemState = !j ? "waiting"
      : !p?.proposal || p.action === "leave" ? "unclear"
      : p.proposal.complete ? "suggest" : "incomplete";
    items.push({ capture: c, judgment: j, state });
  }

  const byId = new Map(captures.map(c => [c.client_id, c]));
  const auto: AutoFiled<C, N>[] = [];
  for (const j of latest.values()) {
    if (j.payload?.action !== "auto" || answered.has(j.client_id)) continue;
    const note = notes.find(n => n.payload?.files === j.payload!.target);
    if (!note) continue;
    auto.push({ capture: byId.get(j.payload.target), judgment: j, note });
  }
  auto.sort((a, b) => b.judgment.recorded_at.localeCompare(a.judgment.recorded_at));

  return { items, auto, judged: new Set(latest.keys()) };
}
