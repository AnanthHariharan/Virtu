import { localDate } from "./time";
import type { Correction, EventKind, Payloads } from "./schema";

/**
 * The one constructor for a ledger row.
 *
 * The app's `log()` and the MCP server both mint events here, so a row
 * written by an agent on a laptop is indistinguishable in shape from one
 * written by a thumb on a phone: a client-minted `client_id` (the
 * idempotency key), both timestamps, and the calendar day of when it
 * HAPPENED in local time. Where the row is then stored differs by host;
 * what a row is does not.
 *
 * Pure: no browser, no database.
 */

export type Source = "phone" | "desktop" | "agent" | "import";

export interface MintOptions {
  occurredAt?: Date;
  raw?: string;
  source?: Source;
  /** For tests: the moment of recording. */
  now?: Date;
}

export interface Minted<K extends EventKind> {
  id: string;
  client_id: string;
  kind: K;
  occurred_at: string;
  recorded_at: string;
  local_date: string;
  raw: string | null;
  payload: (Payloads[K] & Correction) | null;
  status: "raw" | "confirmed";
  source: Source;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function mintEvent<K extends EventKind>(
  kind: K, payload: Payloads[K] & Correction, opts: MintOptions = {}
): Minted<K> {
  const now = opts.now ?? new Date();
  const when = opts.occurredAt ?? now;
  return {
    id: uuid(),
    client_id: uuid(),
    kind,
    occurred_at: when.toISOString(),
    recorded_at: now.toISOString(),
    local_date: localDate(when),
    raw: opts.raw ?? null,
    payload,
    // A bare capture is 'raw' and waits for structure; anything already
    // shaped is confirmed on arrival.
    status: kind === "capture" ? "raw" : "confirmed",
    source: opts.source ?? "phone",
  };
}
