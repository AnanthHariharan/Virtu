"use client";

import { db, safe, getMeta, setMeta } from "./db";
import { remote, type Cursor } from "./remote";
import { localDate } from "./time";
import { parsePayload } from "@/core/schema";
import { resolveCorrections } from "@/core/fold";
import { mintEvent } from "@/core/event";
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
  // The same constructor the MCP server uses: one shape for every row.
  const ev: VEvent<K> = { ...mintEvent(kind, payload, opts), _sync: "pending" };

  await safe(() => db.put("events", ev), undefined);
  emit();
  void flush();
  return ev;
}

/**
 * Write an event whose payload arrived as untyped JSON — from an agent, an
 * import, a model's suggestion. It is checked against the same schema the
 * compiler enforces for `log()`, and a payload that does not fit is refused
 * rather than written. This is still the one write path: it ends in `log()`.
 */
export async function logUntrusted(kind: string, payload: unknown, opts: LogOptions = {}): Promise<VEvent> {
  const r = parsePayload(kind, payload);
  if (!r.ok) throw new Error(`Refused ${kind}: ${r.error}`);
  return log(r.kind, r.payload as Payload<EventKind>, opts);
}

/**
 * A correction is a new event pointing at the one it supersedes. It keeps
 * the target's occurred_at, so it lands on the same day as what it fixes.
 */
export async function correct<K extends EventKind>(target: VEvent<K>, payload: Payload<K>) {
  const { void: _v, corrects: _c, ...rest } = payload as Payload<K>;
  return log(target.kind, { ...rest, corrects: target.client_id } as Payload<K>, {
    occurredAt: new Date(target.occurred_at),
  });
}

/** Strike an entry logged by mistake. The log keeps both rows. */
export async function strike<K extends EventKind>(target: VEvent<K>) {
  const { void: _v, corrects: _c, ...rest } = (target.payload ?? {}) as Payload<K>;
  return log(target.kind, { ...rest, corrects: target.client_id, void: true } as Payload<K>, {
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
  void flush();
}

export async function archiveEntity(id: string) {
  const e = await safe(() => db.get<Entity>("entities", id), undefined);
  if (!e) return;
  await safe(() => db.put("entities", {
    ...e, archived_at: new Date().toISOString(), _sync: "pending" as const,
  }), undefined);
  emit();
  void flush();
}

/* ── reads ────────────────────────────────────────────────────────── */

/*
 * Every read resolves corrections, so no page ever counts a corrected set
 * twice. A correction shares its target's kind and occurred_at (see
 * `correct()`), so resolving within one day or one kind is complete.
 */

const newestFirst = (a: VEvent, b: VEvent) => b.occurred_at.localeCompare(a.occurred_at);

export async function eventsOn(date = localDate()): Promise<VEvent[]> {
  const rows = await safe(() => db.byIndex<VEvent>("events", "by_date", date), []);
  return resolveCorrections(rows).sort(newestFirst);
}

export async function eventsOfKind<K extends EventKind>(kind: K): Promise<VEvent<K>[]> {
  const rows = await safe(() => db.byIndex<VEvent<K>>("events", "by_kind", kind), []);
  return resolveCorrections(rows).sort(newestFirst);
}

export async function allEvents(): Promise<VEvent[]> {
  const rows = await safe(() => db.all<VEvent>("events"), []);
  return resolveCorrections(rows).sort(newestFirst);
}

/* ── sync ─────────────────────────────────────────────────────────── */

let flushing = false;

const strip = <T extends { _sync?: unknown }>({ _sync, ...row }: T) => row;

/**
 * Push pending events and entities. Safe to call constantly — it no-ops when
 * offline, unconfigured, signed out, or already running. Nothing in the UI
 * awaits it.
 */
export async function flush(): Promise<void> {
  if (flushing || !remote.configured()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    // Without a session, auth.uid() is null and every row would be refused.
    if (!(await remote.signedIn())) return;

    const pending = await safe(() => db.byIndex<VEvent>("events", "by_sync", "pending"), []);
    if (pending.length) {
      await remote.pushEvents(pending.map(strip));
      // Events are immutable, so what was pushed is what is stored.
      await db.putAll("events", pending.map(e => ({ ...e, _sync: "synced" as const })));
    }

    const all = await safe(() => db.all<Entity>("entities"), []);
    const dirty = all.filter(e => e._sync === "pending");
    if (dirty.length) {
      const rows = dirty.map(strip);
      await remote.pushEntities(rows);
      // Entities are not immutable: a load patched while the push was in
      // flight must stay pending, so only rows unchanged since are marked.
      const sent = new Map(rows.map(r => [r.id, JSON.stringify(r)]));
      const now = await safe(() => db.all<Entity>("entities"), []);
      await db.putAll("entities", now
        .filter(e => e._sync === "pending" && sent.get(e.id) === JSON.stringify(strip(e)))
        .map(e => ({ ...e, _sync: "synced" as const })));
    }
    if (pending.length || dirty.length) emit();
  } catch {
    /* stay pending; the next trigger retries */
  } finally {
    flushing = false;
  }
}

const PAGE = 1000;

/**
 * Pull configuration and the whole history down into the local store.
 *
 * Events arrive incrementally from a keyset cursor over the server's
 * insertion order, a page at a time, so a new device receives everything
 * rather than a recent window, and a device that has pulled before receives
 * only what is new. Nothing local that has not yet synced is overwritten.
 */
export async function pull(): Promise<void> {
  if (!remote.configured()) return;
  try {
    if (!(await remote.signedIn())) return;

    // Archived rows too, so an archive made on one device reaches the rest.
    const ents = await remote.fetchEntities();
    const localEnts = await safe(() => db.all<Entity>("entities"), []);
    const dirty = new Set(localEnts.filter(e => e._sync === "pending").map(e => e.id));
    await db.putAll("entities", ents
      .filter(e => !dirty.has(e.id))
      .map(e => ({ ...e, _sync: "synced" as const })));

    const local = await safe(() => db.all<VEvent>("events"), []);
    const pendingIds = new Set(local.filter(e => e._sync === "pending").map(e => e.client_id));

    let cursor = await getMeta<Cursor | null>("pull:events", null);
    for (;;) {
      const page = await remote.fetchEvents(cursor, PAGE);
      if (!page.length) break;
      await db.putAll("events", page
        .filter(e => !pendingIds.has(e.client_id))
        .map(e => ({ ...e, _sync: "synced" as const })));
      const last = page[page.length - 1];
      cursor = { at: last.created_at, id: last.id };
      await setMeta("pull:events", cursor);
      if (page.length < PAGE) break;
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
  // Signing in is the moment a queue that could not push suddenly can.
  const unAuth = remote.onSignIn(() => { void pull().then(go); });
  void pull();
  go();
  const t = setInterval(go, 60_000);
  return () => {
    clearInterval(t);
    unAuth();
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
