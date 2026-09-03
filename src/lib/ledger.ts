"use client";

import { db, safe } from "./db";
import { supabase, hasRemote } from "./supabase";
import { localDate } from "./time";
import type { VEvent, Entity, EventKind, Payload } from "./types";

/**
 * The ledger. Three lines of contract, and they are expensive to break:
 *
 *   1. Every write goes through `log()` — module, sheet or agent, no
 *      exceptions. A second write path is how you end up with two schemas.
 *   2. It lands in IndexedDB and returns. It never awaits the network.
 *   3. Events are append-only. Corrections are new events, never UPDATEs.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Every hook subscribes here; one notification refreshes the whole UI. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit() { listeners.forEach(fn => fn()); }

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface LogOptions {
  occurredAt?: Date;
  raw?: string;
  source?: VEvent["source"];
}

/**
 * Write one event. Generic over the payload map, so `log("set", { rep: 5 })`
 * does not compile.
 */
export async function log<K extends EventKind>(
  kind: K, payload: Payload<K>, opts: LogOptions = {}
): Promise<VEvent<K>> {
  const when = opts.occurredAt ?? new Date();
  const ev: VEvent<K> = {
    id: uuid(),
    client_id: uuid(),
    kind,
    occurred_at: when.toISOString(),
    recorded_at: new Date().toISOString(),
    local_date: localDate(when),
    raw: opts.raw ?? null,
    payload,
    // A bare capture is 'raw' and waits for structure; anything the UI has
    // already shaped is confirmed on arrival.
    status: kind === "capture" ? "raw" : "confirmed",
    source: opts.source ?? "phone",
    _sync: "pending",
  };

  await safe(() => db.put("events", ev), undefined);
  emit();
  void flush();
  return ev;
}

/** A correction is a new event pointing at the one it supersedes. */
export async function correct<K extends EventKind>(target: VEvent<K>, payload: Payload<K>) {
  return log(target.kind, { ...payload, corrects: target.client_id }, {
    occurredAt: new Date(target.occurred_at),
  });
}

/* ── entities ─────────────────────────────────────────────────────── */

export async function entities(kind?: string): Promise<Entity[]> {
  const rows = kind
    ? await safe(() => db.byIndex<Entity>("entities", "by_kind", kind), [])
    : await safe(() => db.all<Entity>("entities"), []);
  return rows
    .filter(e => !e.archived_at)
    .sort((a, b) => (a.ord ?? 9999) - (b.ord ?? 9999) || a.name.localeCompare(b.name));
}

/**
 * A cache of what the log already says — a book's page, an exercise's best.
 * Patch it freely; the events remain the record of how it got there.
 */
export async function patchState(id: string, patch: Record<string, unknown>) {
  const e = await safe(() => db.get<Entity>("entities", id), undefined);
  if (!e) return;
  await safe(() => db.put("entities", {
    ...e, state: { ...e.state, ...patch }, _sync: "pending" as const,
  }), undefined);
  emit();
  void flush();
}

export async function putEntity(e: Entity) {
  await safe(() => db.put("entities", { ...e, _sync: "pending" as const }), undefined);
  emit();
}

export async function archiveEntity(id: string) {
  const e = await safe(() => db.get<Entity>("entities", id), undefined);
  if (!e) return;
  await safe(() => db.put("entities", {
    ...e, archived_at: new Date().toISOString(), _sync: "pending" as const,
  }), undefined);
  emit();
}

/* ── reads ────────────────────────────────────────────────────────── */

export async function eventsOn(date = localDate()): Promise<VEvent[]> {
  const rows = await safe(() => db.byIndex<VEvent>("events", "by_date", date), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function eventsOfKind<K extends EventKind>(kind: K): Promise<VEvent<K>[]> {
  const rows = await safe(() => db.byIndex<VEvent<K>>("events", "by_kind", kind), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function allEvents(): Promise<VEvent[]> {
  const rows = await safe(() => db.all<VEvent>("events"), []);
  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/* ── sync ─────────────────────────────────────────────────────────── */

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
    const pending = await safe(() => db.byIndex<VEvent>("events", "by_sync", "pending"), []);
    if (!pending.length) return;

    // client_id carries the idempotency: a double push after a flaky
    // connection collides on (user_id, client_id) and lands once.
    const rows = pending.map(({ _sync, ...row }) => row);
    const { error } = await supabase!.from("events").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw error;

    await db.putAll("events", pending.map(e => ({ ...e, _sync: "synced" as const })));
    emit();
  } catch {
    /* stay pending; the next trigger retries */
  } finally {
    flushing = false;
  }
}

/** Pull configuration and recent history down into the local store. */
export async function pull(sinceDays = 180): Promise<void> {
  if (!hasRemote()) return;
  try {
    const { data: ents } = await supabase!.from("entities").select("*").is("archived_at", null);
    if (ents) await db.putAll("entities", ents.map(e => ({ ...e, _sync: "synced" as const })));

    const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
    const { data: evs } = await supabase!.from("events").select("*").gte("occurred_at", since);
    if (evs) {
      // never clobber a local write that has not synced yet
      const local = await safe(() => db.all<VEvent>("events"), []);
      const pendingIds = new Set(local.filter(e => e._sync === "pending").map(e => e.client_id));
      await db.putAll("events", evs
        .filter((e: VEvent) => !pendingIds.has(e.client_id))
        .map((e: VEvent) => ({ ...e, _sync: "synced" as const })));
    }
    emit();
  } catch {
    /* offline; the local store is still authoritative for the UI */
  }
}

export async function pendingCount(): Promise<number> {
  return (await safe(() => db.byIndex<VEvent>("events", "by_sync", "pending"), [])).length;
}

/**
 * iOS has no Background Sync API and never has. The queue drains on the
 * moments we actually get: app open, regaining focus, coming back online.
 * Do not add a service worker `sync` handler and believe it fires.
 */
export function startSync(): () => void {
  const go = () => { void flush(); };
  const onVisible = () => { if (!document.hidden) go(); };
  window.addEventListener("online", go);
  window.addEventListener("focus", go);
  document.addEventListener("visibilitychange", onVisible);
  void pull();
  go();
  const t = setInterval(go, 60_000);
  return () => {
    clearInterval(t);
    window.removeEventListener("online", go);
    window.removeEventListener("focus", go);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Everything, as one JSON file. The escape hatch that makes this yours. */
export async function exportAll(): Promise<string> {
  return JSON.stringify({
    app: "virtu",
    exported_at: new Date().toISOString(),
    entities: await safe(() => db.all<Entity>("entities"), []),
    events: await safe(() => db.all<VEvent>("events"), []),
  }, null, 2);
}
