/**
 * The vocabulary of the ledger.
 *
 * One event table, many kinds. `Payloads` is the single source of truth for
 * what each kind carries — `logEvent` is generic over it, so a typo in a
 * payload key is a compile error rather than a silently empty row six months
 * from now. This is the one thing Nitya's `Record<string, unknown>` payloads
 * could not give us.
 */

export type Slot = "morning" | "midday" | "evening" | "night";

export interface Payloads {
  /** An anushtana observed (or explicitly un-observed — the log is append-only). */
  rite: { slug: string; name: string; slot: Slot; observed: boolean };

  /** A completed mala. */
  japa: { mantra: string; count: number; target: number; malas: number };

  /** One working set. `weight: 0` means bodyweight. */
  set: {
    exercise: string; name: string;
    weight: number; reps: number; unit: "kg" | "lb";
    rpe?: number; session?: string;
  };

  /** A planned meal taken, or dismissed with a cause. */
  meal: { slug: string; name: string; slot: string; status: "ate" | string; note?: string };

  /** A learning filed under a head, optionally sourced. */
  note: {
    text: string;
    head: string | null; headName: string | null;
    source: string | null; sourceName: string | null;
  };

  /** A reading session, measured in pages. */
  read: { book: string; name: string; from: number; to: number };

  /** A piece of writing entering a new state. */
  piece: { title: string; status: "idea" | "drafting" | "published"; from?: string };

  /** A step of a project struck through, or un-struck. */
  task: { project: string; step: string; done: boolean };

  /** A number about the body: weight, sleep, resting heart rate. */
  measure: { metric: string; name: string; value: number; unit: string };

  /** Free text awaiting structure. The only kind with no schema by design. */
  capture: { text: string };
}

export type EventKind = keyof Payloads;

/** A correction is a new event that names the one it supersedes. */
export type Payload<K extends EventKind> = Payloads[K] & { corrects?: string };

export type SyncState = "pending" | "synced";

export interface VEvent<K extends EventKind = EventKind> {
  id: string;
  /** Minted on the client before the write. The idempotency key for sync. */
  client_id: string;
  kind: K;
  /** When it happened. */
  occurred_at: string;
  /** When it was entered. Never the same column as occurred_at. */
  recorded_at: string;
  /** The user's calendar day for occurred_at. Always via localDate(). */
  local_date: string;
  raw: string | null;
  payload: Payload<K> | null;
  status: "raw" | "confirmed";
  source: "phone" | "desktop" | "agent" | "import";
  /** Local only. Not a column. */
  _sync?: SyncState;
}

export type EntityKind =
  | "rite" | "exercise" | "session" | "meal" | "head"
  | "book" | "project" | "metric";

export interface Entity {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  aliases: string[];
  /** Immutable facts: an author, a page count, a scheme, a slot. */
  meta: Record<string, any>;
  /** Current cached state: a page, a best. The log stays the record of how. */
  state: Record<string, any>;
  ord: number | null;
  archived_at: string | null;
  _sync?: SyncState;
}
