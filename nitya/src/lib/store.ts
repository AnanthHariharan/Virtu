"use client";

import { idb, safe } from "./idb";
import { supabase, hasRemote } from "./supabase";
import { localDate } from "./time";
import type { NEvent, Entity, EventKind } from "./types";

/**
 * The write path. Three lines of contract:
 *
 *   1. Every write goes through logEvent — agent or human, no exceptions.
 *      A second write path is how you end up with two schemas.
 *   2. It lands in IndexedDB and returns. It never awaits the network.
 *   3. Sync is a separate, failable, retryable concern.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { listeners.forEach(fn => fn()); }

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface LogInput {
  kind: EventKind;
  payload?: Record<string, unknown>;
  raw?: string;
  occurredAt?: Date;
  source?: NEvent["source"];
  /** entity ids this event touches, with the role it played */
  touches?: { entityId: string; role: string; qty?: number; unit?: string }[];
}

export async function logEvent(input: LogInput): Promise<NEvent> {
  const when = input.occurredAt ?? new Date();
  const ev: NEvent = {
    id: uuid(),
    client_id: uuid(),
    kind: input.kind,
    occurred_at: when.toISOString(),
    recorded_at: new Date().toISOString(),
    local_date: localDate(when),
    raw: input.raw ?? null,
    payload: input.payload ?? null,
    // A free-text note is 'raw' and waits for the extraction worker.
    // Anything already structured by the UI is confirmed on arrival.
    status: input.payload ? "confirmed" : "raw",
    source: input.source ?? "phone",
    _sync: "pending",
  };

  await safe(() => idb.put("events", ev), undefined);
  if (input.touches?.length) {
    await safe(() => idb.put("meta", { key: `touches:${ev.client_id}`, value: input.touches }), undefined);
  }
  emit();
  void flush();
  return ev;
}

/** Correction, not mutation: a new event that points at the one it supersedes. */
export async function correctEvent(target: NEvent, payload: Record<string, unknown>) {
  return logEvent({
    kind: target.kind,
    occurredAt: new Date(target.occurred_at),
    payload: { ...payload, corrects: target.client_id },
  });
}

/* ── entities ───────────────────────────────────────────────── */

export async function getEntities(kind?: string): Promise<Entity[]> {
  const rows = kind
    ? await safe(() => idb.byIndex<Entity>("entities", "by_kind", kind), [])
    : await safe(() => idb.all<Entity>("entities"), []);
  return rows
    .filter(e => !e.archived_at)
    .sort((a, b) => (a.ord ?? 999) - (b.ord ?? 999) || a.name.localeCompare(b.name));
}

export async function bySlug(kind: string, slug: string): Promise<Entity | undefined> {
  const all = await getEntities(kind);
  return all.find(e => e.slug === slug);
}

/** Mutable current state (a book's page, an exercise's best). The event log stays the record of how. */
export async function patchEntityState(id: string, patch: Record<string, unknown>) {
  const e = await safe(() => idb.get<Entity>("entities", id), undefined);
  if (!e) return;
  const next: Entity = { ...e, state: { ...e.state, ...patch }, _sync: "pending" };
  await safe(() => idb.put("entities", next), undefined);
  emit();
  void flush();
}

/* ── reads ──────────────────────────────────────────────────── */

export async function eventsOn(date = localDate()): Promise<NEvent[]> {
  const rows = await safe(() => idb.byIndex<NEvent>("events", "by_date", date), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function eventsOfKind(kind: EventKind, limit = 200): Promise<NEvent[]> {
  const rows = await safe(() => idb.byIndex<NEvent>("events", "by_kind", kind), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, limit);
}

export async function allEvents(): Promise<NEvent[]> {
  const rows = await safe(() => idb.all<NEvent>("events"), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/* ── sync ───────────────────────────────────────────────────── */

let flushing = false;

/**
 * Push pending events. Safe to call constantly — it no-ops when offline,
 * unconfigured, or already running. Nothing in the UI awaits it.
 */
export async function flush(): Promise<void> {
  if (flushing || !hasRemote()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    const pending = await safe(() => idb.byIndex<NEvent>("events", "by_sync", "pending"), []);
    if (!pending.length) return;

    // client_id carries the idempotency: a double-sync after a flaky
    // connection collides on (user_id, client_id) and lands once.
    const rows = pending.map(({ _sync, ...row }) => row);
    const { error } = await supabase!.from("events").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw error;

    await idb.putAll("events", pending.map(e => ({ ...e, _sync: "synced" as const })));
    emit();
  } catch {
    /* stay pending; the next trigger retries */
  } finally {
    flushing = false;
  }
}

/** Pull configuration and recent history into the local store. */
export async function pull(sinceDays = 120): Promise<void> {
  if (!hasRemote()) return;
  try {
    const { data: ents } = await supabase!.from("entities").select("*").is("archived_at", null);
    if (ents) await idb.putAll("entities", ents.map(e => ({ ...e, _sync: "synced" as const })));

    const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
    const { data: evs } = await supabase!.from("events").select("*").gte("occurred_at", since);
    if (evs) {
      // never clobber a local write that has not synced yet
      const local = await safe(() => idb.all<NEvent>("events"), []);
      const pendingIds = new Set(local.filter(e => e._sync === "pending").map(e => e.client_id));
      await idb.putAll("events", evs
        .filter((e: NEvent) => !pendingIds.has(e.client_id))
        .map((e: NEvent) => ({ ...e, _sync: "synced" as const })));
    }
    emit();
  } catch {
    /* offline; the local store is still authoritative for the UI */
  }
}

export async function pendingCount(): Promise<number> {
  const p = await safe(() => idb.byIndex<NEvent>("events", "by_sync", "pending"), []);
  return p.length;
}

/**
 * iOS has no Background Sync API, so the queue drains on the moments we
 * actually get: app open, regaining focus, coming back online.
 */
export function startSync(): () => void {
  const go = () => { void flush(); };
  window.addEventListener("online", go);
  window.addEventListener("focus", go);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) go(); });
  void pull();
  go();
  const t = setInterval(go, 60_000);
  return () => { clearInterval(t); window.removeEventListener("online", go); window.removeEventListener("focus", go); };
}
