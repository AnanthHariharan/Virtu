import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { buildServer, storeFromEnv } from "./server";
import { MemoryStore, FileStore, type Row } from "./store";
import { mintEvent } from "@/core/event";
import { SAMPLES } from "@/test/fixtures";

const NOW = new Date("2026-09-30T19:00:00-07:00");

/** The real SDK over a fake network that answers the guard's three questions. */
function jev(scores: { matches: number; plausible: number; when: number }, seen: any[] = []) {
  return new TypeSafeClient({
    apiKey: "k", retry: { maxRetries: 0 }, logLevel: "off",
    fetch: async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        model: "jev-1.13.0",
        answers: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { type: "noul", noul: v }])),
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200 });
    },
  });
}

async function connect(opts: { store: MemoryStore; jev?: TypeSafeClient | null; unguarded?: boolean }) {
  const server = buildServer({ store: opts.store, jev: opts.jev ?? null, unguarded: opts.unguarded, now: () => NOW });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as { text: string }[])[0].text);
  };
  return { client, call };
}

const row = <K extends keyof typeof SAMPLES>(kind: K, payload: any, date = "2026-09-30") =>
  mintEvent(kind as any, payload, { occurredAt: new Date(`${date}T12:00:00-07:00`), now: new Date(`${date}T12:00:00-07:00`) }) as Row;

let store: MemoryStore;
beforeEach(() => { store = new MemoryStore(); });

describe("the MCP server", () => {
  it("lists its tools, marking reads as read-only", async () => {
    const { client } = await connect({ store });
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(["account", "capture", "day", "events", "forecast", "log_event", "search", "summary", "week"]);
    expect(tools.find(t => t.name === "events")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find(t => t.name === "log_event")!.annotations?.readOnlyHint).toBe(false);
  });

  it("reads resolve corrections, like every read in the app", async () => {
    const a = row("set", { ...SAMPLES.set, weight: 60 });
    const b = row("set", { ...SAMPLES.set, weight: 65, corrects: a.client_id });
    store.rows.push(a, b);
    const { call } = await connect({ store });
    const res = await call("events", { kind: "set" });
    expect(res.count).toBe(1);
    expect(res.events[0].payload.weight).toBe(65);
    expect(res.events[0].line).toContain("65lb × 8");
    expect((await call("summary")).byKind).toEqual({ set: 1 });
  });

  it("filters by range, and reads a day as Today does", async () => {
    store.rows.push(row("capture", { text: "old" }, "2026-09-01"), row("rite", SAMPLES.rite), row("rite", { ...SAMPLES.rite, observed: false }, "2026-09-29"));
    const { call } = await connect({ store });
    expect((await call("events", { from: "2026-09-29" })).count).toBe(2);
    const day = await call("day", {});
    expect(day.date).toBe("2026-09-30");
    expect(day.lines.map((l: any) => l.line)).toEqual(["Prataḥ sandhyāvandanam · Rite"]);
  });

  it("searches notes, captures and reflections for every word", async () => {
    store.rows.push(row("note", { ...SAMPLES.note, text: "Structure is the ornament" }), row("capture", { text: "structure of the essay" }), row("set", SAMPLES.set));
    const { call } = await connect({ store });
    expect((await call("search", { query: "structure" })).count).toBe(2);
    expect((await call("search", { query: "structure ornament" })).count).toBe(1);
  });

  it("gives the account and the week", async () => {
    store.ents.push({ id: "rite:am", kind: "rite", slug: "am", name: "Morning", meta: { slot: "morning" }, state: {}, ord: 1, archived_at: null });
    const { call } = await connect({ store });
    const acct = await call("account", {});
    expect(acct.slot).toBe("evening");
    expect(acct.threads.map((t: any) => t.type)).toContain("rites");
    const wk = await call("week", {});
    expect(wk.lines.find((l: any) => l.label === "Sets")).toEqual({ label: "Sets", now: 0, prev: 0 });
  });

  it("forecasts honestly: with too few days it says so", async () => {
    store.rows.push(row("measure", { metric: "sleep", name: "Sleep", value: 7, unit: "h" }));
    const { call } = await connect({ store });
    const res = await call("forecast", { target: "sleep" });
    expect(res).toMatchObject({ date: "2026-09-30", target: "sleep", status: "insufficient", tomorrow: null });
  });

  it("capture writes a raw line as the agent's, unguarded", async () => {
    const { call } = await connect({ store });
    const res = await call("capture", { text: "call the physio" });
    expect(res.written).toBe(true);
    expect(store.rows[0]).toMatchObject({ kind: "capture", status: "raw", source: "agent", raw: "call the physio" });
  });
});

describe("log_event", () => {
  const measure = { kind: "measure", payload: { metric: "weight", name: "Body weight", value: 71.2, unit: "kg" }, said: "weighed 71.2 this morning" };

  it("refuses a payload the schema does not accept, before asking anyone", async () => {
    const seen: any[] = [];
    const { call } = await connect({ store, jev: jev({ matches: 1, plausible: 1, when: 1 }, seen) });
    const res = await call("log_event", { kind: "set", payload: { exercise: "x", rep: 5 }, said: "x" });
    expect(res.written).toBe(false);
    expect(res.reason).toMatch(/^schema:/);
    expect(seen).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("refuses to write judgments or verdicts", async () => {
    const { call } = await connect({ store, jev: jev({ matches: 1, plausible: 1, when: 1 }) });
    const res = await call("log_event", { kind: "verdict", payload: SAMPLES.verdict, said: "x" });
    expect(res.reason).toMatch(/not an agent's/);
  });

  it("with no guard configured, refuses and points at capture", async () => {
    const { call } = await connect({ store });
    const res = await call("log_event", measure);
    expect(res.written).toBe(false);
    expect(res.reason).toMatch(/capture/);
    expect(store.rows).toHaveLength(0);
  });

  it("a guard that doubts the entry writes nothing and says why", async () => {
    const { call } = await connect({ store, jev: jev({ matches: 0.3, plausible: 0.9, when: 0.9 }) });
    const res = await call("log_event", { ...measure, payload: { ...measure.payload, value: 17.2 } });
    expect(res).toMatchObject({ written: false, scores: { matches: 0.3, plausible: 0.9, when: 0.9 } });
    expect(res.reason).toMatch(/does not record what was said/);
    expect(store.rows).toHaveLength(0);
  });

  it("a guarded write lands with the user's words, and its judgment beside it", async () => {
    const seen: any[] = [];
    const { call } = await connect({ store, jev: jev({ matches: 0.95, plausible: 0.9, when: 0.9 }, seen) });
    const res = await call("log_event", { ...measure, occurred_at: "2026-09-30T07:30:00-07:00" });
    expect(res).toMatchObject({ written: true, guarded: true, local_date: "2026-09-30" });

    expect(seen[0].state).toEqual({
      said: "weighed 71.2 this morning",
      entry: { kind: "measure", ...measure.payload, occurred_at: "2026-09-30T14:30:00.000Z" },
      today: "2026-09-30",
    });
    const [entry, judgment] = store.rows;
    expect(entry).toMatchObject({ kind: "measure", source: "agent", raw: "weighed 71.2 this morning", status: "confirmed" });
    expect(entry.occurred_at).not.toBe(entry.recorded_at);
    expect(judgment).toMatchObject({ kind: "judgment", payload: { target: entry.client_id, task: "guard", action: "auto", model: "jev-1.13.0" } });
  });

  it("refuses a time in the future or one that is not a date", async () => {
    const { call } = await connect({ store, jev: jev({ matches: 1, plausible: 1, when: 1 }) });
    expect((await call("log_event", { ...measure, occurred_at: "2026-10-02T00:00:00Z" })).reason).toMatch(/future/);
    expect((await call("log_event", { ...measure, occurred_at: "last tuesday" })).reason).toMatch(/not a date/);
  });

  it("unguarded mode writes without a judgment, and says so", async () => {
    const { call } = await connect({ store, unguarded: true });
    expect(await call("log_event", measure)).toMatchObject({ written: true, guarded: false });
    expect(store.rows.map(r => r.kind)).toEqual(["measure"]);
  });
});

describe("stores", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "virtu-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("a Settings export is read, appended to once, and stays a valid export", async () => {
    const path = join(dir, "virtu.json");
    const existing = { ...row("set", SAMPLES.set), _sync: "synced" };
    await writeFile(path, JSON.stringify({ app: "virtu", exported_at: "x", entities: [], events: [existing] }));
    const fs = new FileStore(path);
    expect((await fs.events())[0]).not.toHaveProperty("_sync");
    const r = mintEvent("capture", { text: "hi" }, { source: "agent" });
    await fs.append(r);
    await fs.append(r);
    const back = JSON.parse(await readFile(path, "utf8"));
    expect(back.app).toBe("virtu");
    expect(back.events).toHaveLength(2);
  });

  it("refuses a file that is not an export", async () => {
    const path = join(dir, "x.json");
    await writeFile(path, JSON.stringify({ hello: 1 }));
    await expect(new FileStore(path).events()).rejects.toThrow(/not a Virtu export/);
  });

  it("picks a store from the environment", () => {
    expect(storeFromEnv({ VIRTU_EXPORT: "/tmp/x.json" }).name).toBe("file /tmp/x.json");
    expect(storeFromEnv({ SUPABASE_URL: "http://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", VIRTU_USER_ID: "u" }).name).toBe("supabase");
    expect(() => storeFromEnv({})).toThrow(/VIRTU_EXPORT/);
  });
});
