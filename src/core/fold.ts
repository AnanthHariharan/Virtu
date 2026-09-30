/**
 * Reading the append-only log back as the current truth.
 *
 * Events are never updated. A wrong number is fixed by a new event whose
 * payload carries `corrects: <client_id>`, and a mistaken entry is struck by
 * one that also carries `void: true`. Every read of the ledger passes through
 * `resolveCorrections` so that a corrected set is counted once, at its
 * corrected value — in volume, in records, in Today — while the log keeps
 * both rows and the record of the change of mind.
 *
 * Pure: no browser, no database.
 */

interface Correctable {
  client_id: string;
  payload: unknown;
}

function correctionOf(e: Correctable): { corrects?: string; void?: boolean } {
  const p = e.payload as { corrects?: unknown; void?: unknown } | null | undefined;
  return {
    corrects: typeof p?.corrects === "string" ? p.corrects : undefined,
    void: p?.void === true,
  };
}

/**
 * The events that currently stand. An event is dropped when a later one
 * names it in `corrects`; a correction that voids is dropped too. Chains
 * resolve naturally — correcting a correction supersedes both earlier rows.
 * Order is preserved.
 */
export function resolveCorrections<T extends Correctable>(events: T[]): T[] {
  const superseded = new Set<string>();
  for (const e of events) {
    const c = correctionOf(e);
    if (c.corrects) superseded.add(c.corrects);
  }
  if (!superseded.size) return events;
  return events.filter(e => !superseded.has(e.client_id) && !correctionOf(e).void);
}
