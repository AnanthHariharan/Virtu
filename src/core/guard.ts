import type { Answer } from "./schema";

/**
 * The guard on an agent's write.
 *
 * An agent that writes to the ledger (through the MCP server) must say what
 * the user actually said, and must shape it into a payload the schema
 * accepts. The schema catches a malformed entry; it cannot catch a
 * well-formed wrong one — 65 when you said 56, a set when you described a
 * plan, yesterday's run stamped today. So before the write, Jev is asked
 * three narrow yes/no questions about the entry against the words, and
 * code decides from the answers:
 *
 *   - `matches`   the entry records what was said, and nothing more;
 *   - `plausible` its numbers are believable for one person's own log;
 *   - `when`      its time is the time that was meant.
 *
 * One narrow LLM (the agent) proposes; one calibrated model checks; code
 * decides. Neither model writes.
 *
 * Pure: no browser, no database, no network.
 */

export interface GuardEntry {
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export function guardRequest(said: string, entry: GuardEntry, today: string) {
  return {
    state: {
      said,
      entry: { kind: entry.kind, ...entry.payload, occurred_at: entry.occurred_at },
      today,
    },
    questions: {
      matches: {
        type: "noul" as const,
        instructions: "`entry` records what `said` says, and adds nothing that `said` does not say.",
      },
      plausible: {
        type: "noul" as const,
        instructions: "Every number in `entry` is believable in one person's own log of their day — a body weight, a lift, minutes of sport, pages read.",
      },
      when: {
        type: "noul" as const,
        instructions: "`entry.occurred_at` is the time `said` refers to; or `said` gives no time and `entry.occurred_at` falls on `today`.",
      },
    },
  };
}

export const GUARD_GATES = { matches: 0.8, plausible: 0.6, when: 0.6 };

const REASONS: Record<keyof typeof GUARD_GATES, string> = {
  matches: "the entry does not record what was said",
  plausible: "a number in the entry is not believable",
  when: "the entry's time is not the time that was meant",
};

export interface GuardDecision {
  ok: boolean;
  /** Why it was refused, one line per failed check. */
  reasons: string[];
  scores: Record<string, number | null>;
}

/** Refuse unless every check clears its gate. A missing answer is a refusal. */
export function decideGuard(answers: Record<string, Answer | undefined>, gates = GUARD_GATES): GuardDecision {
  const reasons: string[] = [];
  const scores: Record<string, number | null> = {};
  for (const [k, gate] of Object.entries(gates) as [keyof typeof GUARD_GATES, number][]) {
    const a = answers[k];
    const v = a?.type === "noul" ? a.noul : null;
    scores[k] = v;
    if (v === null || v < gate) reasons.push(REASONS[k]);
  }
  return { ok: reasons.length === 0, reasons, scores };
}
