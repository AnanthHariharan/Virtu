/**
 * Which rites stand observed.
 *
 * Un-observing a rite writes `observed: false` rather than deleting
 * anything, so the state of a rite on a day is its MOST RECENT event that
 * day — not whether any event said true. Reading it any other way means a
 * rite, once marked, can never be unmarked.
 *
 * Pure: no browser, no database.
 */

interface RiteEventLike {
  kind: string;
  local_date: string;
  occurred_at: string;
  recorded_at: string;
  payload: unknown;
}

const later = (a: RiteEventLike, b: RiteEventLike) =>
  a.occurred_at.localeCompare(b.occurred_at) || a.recorded_at.localeCompare(b.recorded_at);

/** date → the slugs observed on that date, by latest event per (date, slug). */
export function observedByDate(events: RiteEventLike[]): Map<string, Set<string>> {
  const latest = new Map<string, RiteEventLike>();
  for (const e of events) {
    if (e.kind !== "rite") continue;
    const slug = (e.payload as { slug?: unknown } | null)?.slug;
    if (typeof slug !== "string") continue;
    const key = `${e.local_date}\u0000${slug}`;
    const cur = latest.get(key);
    if (!cur || later(e, cur) > 0) latest.set(key, e);
  }
  const out = new Map<string, Set<string>>();
  for (const [key, e] of latest) {
    if ((e.payload as { observed?: unknown }).observed !== true) continue;
    const [date, slug] = key.split("\u0000");
    const s = out.get(date) ?? new Set<string>();
    s.add(slug);
    out.set(date, s);
  }
  return out;
}

/** The slugs observed on one date. */
export function observedOn(events: RiteEventLike[], date: string): Set<string> {
  return observedByDate(events).get(date) ?? new Set();
}
