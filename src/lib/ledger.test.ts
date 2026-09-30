import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cursor, Remote, RemoteEvent, RemoteEntity } from "./remote";
import type { Entity, VEvent } from "./types";

/**
 * An in-memory server with the same contract as `lib/remote`. It stamps
 * `created_at` the way Postgres does — one transaction time for a whole
 * upsert — which is exactly the tie the keyset cursor has to survive.
 */
const server = vi.hoisted(() => {
  const s = {
    configured: true,
    session: true,
    fail: false,
    events: [] as any[],
    entities: new Map<string, any>(),
    clock: 0,
    pushes: 0,
  };
  return s;
});

vi.mock("./remote", () => {
  const remote: Remote = {
    configured: () => server.configured,
    signedIn: async () => server.session,
    async pushEvents(rows) {
      if (server.fail) throw new Error("network");
      server.pushes++;
      const at = new Date(Date.UTC(2026, 8, 1, 0, 0, ++server.clock)).toISOString();
      for (const r of rows) {
        if (server.events.some(e => e.client_id === r.client_id)) continue;
        server.events.push({ ...r, created_at: at, user_id: "u1" });
      }
    },
    async pushEntities(rows) {
      if (server.fail) throw new Error("network");
      for (const r of rows) server.entities.set(r.id, { ...r, user_id: "u1" });
    },
    fetchEntities: async () => [...server.entities.values()] as RemoteEntity[],
    async fetchEvents(after: Cursor | null, limit: number) {
      const sorted = [...server.events].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const rest = after
        ? sorted.filter(e => e.created_at > after.at || (e.created_at === after.at && e.id > after.id))
        : sorted;
      return rest.slice(0, limit) as RemoteEvent[];
    },
    onSignIn: () => () => {},
  };
  return { remote };
});

const { db } = await import("./db");
const ledger = await import("./ledger");
const { log, correct, strike, logUntrusted, eventsOfKind, eventsOn, allEvents,
        flush, pull, pendingCount, patchState, putEntity, entities } = ledger;

const settle = () => new Promise(r => setTimeout(r, 0));

async function reset() {
  await settle();                       // let any fire-and-forget flush finish
  await db.clear("events");
  await db.clear("entities");
  await db.clear("meta");
  Object.assign(server, { configured: true, session: true, fail: false, events: [], clock: 0, pushes: 0 });
  server.entities = new Map();
}

const set = (weight: number, reps = 5) => ({
  exercise: "barbell-squat", name: "Barbell squat", weight, reps, unit: "lb" as const,
});

beforeEach(async () => {
  server.configured = false;            // writes in setup must not push
  await reset();
  server.configured = false;
});

describe("log", () => {
  it("writes locally with two timestamps and a client-minted id", async () => {
    const when = new Date("2026-09-01T21:30:00-07:00");
    const e = await log("set", set(60), { occurredAt: when });
    expect(e.client_id).toBeTruthy();
    expect(e.occurred_at).toBe(when.toISOString());
    expect(e.recorded_at).not.toBe(e.occurred_at);
    expect(e.local_date).toBe("2026-09-01");
    expect(e._sync).toBe("pending");
    expect(await eventsOfKind("set")).toHaveLength(1);
  });

  it("a capture waits as raw; anything shaped is confirmed", async () => {
    const c = await log("capture", { text: "hm" });
    const s = await log("set", set(60));
    expect(c.status).toBe("raw");
    expect(s.status).toBe("confirmed");
  });
});

describe("logUntrusted", () => {
  it("writes a payload that fits its schema", async () => {
    const e = await logUntrusted("measure", { metric: "weight", name: "Body weight", value: 71, unit: "kg" },
                                 { source: "agent" });
    expect(e.source).toBe("agent");
    expect(await eventsOfKind("measure")).toHaveLength(1);
  });

  it("refuses one that does not, and writes nothing", async () => {
    await expect(logUntrusted("set", { exercise: "x", rep: 5 })).rejects.toThrow(/Refused set/);
    await expect(logUntrusted("workout", {})).rejects.toThrow(/unknown event kind/);
    expect(await allEvents()).toHaveLength(0);
  });
});

describe("corrections", () => {
  it("every read shows the corrected value, once", async () => {
    const a = await log("set", set(60));
    await correct(a, { ...a.payload!, weight: 65 });
    const sets = await eventsOfKind("set");
    expect(sets).toHaveLength(1);
    expect(sets[0].payload!.weight).toBe(65);
    expect((await eventsOn(a.local_date)).filter(e => e.kind === "set")).toHaveLength(1);
    expect(await allEvents()).toHaveLength(1);
  });

  it("the correction lands on the target's day and time", async () => {
    const tuesday = new Date("2026-09-01T09:00:00-07:00");
    const a = await log("set", set(60), { occurredAt: tuesday });
    const b = await correct(a, { ...a.payload!, weight: 65 });
    expect(b.occurred_at).toBe(a.occurred_at);
    expect(b.local_date).toBe("2026-09-01");
    expect(b.payload!.corrects).toBe(a.client_id);
  });

  it("strike removes the entry from every read, and the log keeps both rows", async () => {
    const a = await log("set", set(60));
    await strike(a);
    expect(await eventsOfKind("set")).toHaveLength(0);
    expect(await db.all<VEvent>("events")).toHaveLength(2);
  });

  it("correcting a correction targets the correction, not the original", async () => {
    const a = await log("set", set(60));
    const b = await correct(a, { ...a.payload!, weight: 65 });
    const c = await correct(b, { ...b.payload!, weight: 70 });
    expect(c.payload!.corrects).toBe(b.client_id);
    expect((await eventsOfKind("set")).map(e => e.payload!.weight)).toEqual([70]);
  });
});

describe("flush", () => {
  it("does nothing while signed out, and keeps everything pending", async () => {
    await log("set", set(60));
    Object.assign(server, { configured: true, session: false });
    await flush();
    expect(server.events).toHaveLength(0);
    expect(await pendingCount()).toBe(1);
  });

  it("pushes events and marks them synced", async () => {
    await log("set", set(60));
    await log("capture", { text: "x" });
    server.configured = true;
    await flush();
    expect(server.events).toHaveLength(2);
    expect(await pendingCount()).toBe(0);
  });

  it("a failed push leaves the queue intact for the next trigger", async () => {
    await log("set", set(60));
    Object.assign(server, { configured: true, fail: true });
    await flush();
    expect(await pendingCount()).toBe(1);
    server.fail = false;
    await flush();
    expect(await pendingCount()).toBe(0);
  });

  it("pushes entities too — a working load reaches the server", async () => {
    const ent: Entity = {
      id: "exercise:barbell-squat", kind: "exercise", slug: "barbell-squat", name: "Barbell squat",
      aliases: [], meta: {}, state: { load: 60 }, ord: 1, archived_at: null,
    };
    await putEntity(ent);
    await patchState(ent.id, { load: 65 });
    server.configured = true;
    await flush();
    expect(server.entities.get(ent.id)?.state).toEqual({ load: 65 });
    const local = await db.get<Entity>("entities", ent.id);
    expect(local?._sync).toBe("synced");
  });
});

describe("pull", () => {
  it("receives the whole history, a page at a time, across a created_at tie", async () => {
    // 2,500 events pushed in one upsert share one created_at.
    server.configured = true;
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `e-${String(i).padStart(5, "0")}`, client_id: `r-${i}`, kind: "capture",
      occurred_at: "2025-01-01T12:00:00.000Z", recorded_at: "2025-01-01T12:00:00.000Z",
      local_date: "2025-01-01", raw: null, payload: { text: `t${i}` },
      status: "raw", source: "phone",
    }));
    await (await import("./remote")).remote.pushEvents(rows as any);
    await pull();
    expect(await db.all("events")).toHaveLength(2500);
  });

  it("is incremental: a second pull fetches only what is new", async () => {
    server.configured = true;
    await log("capture", { text: "one" });
    await settle();
    await pull();
    const cursor = await (await import("./db")).getMeta<Cursor | null>("pull:events", null);
    expect(cursor).not.toBeNull();

    const spy = vi.spyOn((await import("./remote")).remote, "fetchEvents");
    await pull();
    expect(spy.mock.calls[0][0]).toEqual(cursor);
    spy.mockRestore();
  });

  it("never overwrites a local event or entity that has not synced", async () => {
    const ent: Entity = {
      id: "book:gita", kind: "book", slug: "gita", name: "Gītā",
      aliases: [], meta: {}, state: { page: 40 }, ord: 1, archived_at: null,
    };
    server.entities.set(ent.id, { ...ent, state: { page: 10 } });
    await putEntity(ent);
    server.configured = true;
    server.session = true;
    server.fail = true;                   // so the queued write cannot push first
    await pull();
    expect((await db.get<Entity>("entities", ent.id))?.state).toEqual({ page: 40 });
  });

  it("brings archived entities down, so an archive reaches every device", async () => {
    server.configured = true;
    server.entities.set("book:old", {
      id: "book:old", kind: "book", slug: "old", name: "Old", aliases: [], meta: {}, state: {},
      ord: 1, archived_at: "2026-01-01T00:00:00.000Z",
    });
    await pull();
    expect((await db.get<Entity>("entities", "book:old"))?.archived_at).toBeTruthy();
    expect(await entities("book")).toHaveLength(0);
  });
});
