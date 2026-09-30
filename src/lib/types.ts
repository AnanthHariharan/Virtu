/**
 * The vocabulary of the ledger.
 *
 * One event table, many kinds. The payload of each kind is defined once, as
 * a runtime schema in `core/schema.ts`, and `Payloads` here is inferred from
 * it — so `log("set", { rep: 5 })` is still a compile error, and an agent's
 * JSON can be checked against the very same shape with `parsePayload()`.
 * Adding a kind means adding its schema there first.
 */
import type { Payloads, EventKind, Correction } from "@/core/schema";

export type { Payloads, EventKind };

export type Slot = "morning" | "midday" | "evening" | "night";

/** A correction is a new event that names the one it supersedes. */
export type Payload<K extends EventKind> = Payloads[K] & Correction;

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
  | "rite" | "portion" | "exercise" | "session" | "meal" | "head"
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
