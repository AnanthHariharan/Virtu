import { readFile, writeFile, rename } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Minted } from "@/core/event";
import type { EventKind } from "@/core/schema";

/**
 * Where the MCP server finds the ledger.
 *
 * The phone's IndexedDB is not reachable from a laptop, so the server reads
 * the copy that sync keeps: Supabase, or — with no database at all — the JSON
 * file Settings exports. Both are append-only from here: the server adds
 * rows and never changes one, exactly like the app.
 */

export interface Row {
  id: string;
  client_id: string;
  kind: string;
  occurred_at: string;
  recorded_at: string;
  local_date: string;
  raw: string | null;
  payload: any;
  status: string;
  source: string;
}

export interface EntityRow {
  id: string;
  kind: string;
  slug: string;
  name: string;
  meta: Record<string, any>;
  state: Record<string, any>;
  ord: number | null;
  archived_at: string | null;
}

export interface Store {
  /** Every event row, unresolved. Callers fold corrections. */
  events(): Promise<Row[]>;
  entities(): Promise<EntityRow[]>;
  append(row: Minted<EventKind>): Promise<void>;
  /** A human-readable name for where this is, for the summary. */
  readonly name: string;
}

export class MemoryStore implements Store {
  readonly name = "memory";
  constructor(public rows: Row[] = [], public ents: EntityRow[] = []) {}
  async events() { return [...this.rows]; }
  async entities() { return [...this.ents]; }
  async append(row: Minted<EventKind>) {
    if (!this.rows.some(r => r.client_id === row.client_id)) this.rows.push(row as Row);
  }
}

/**
 * A Settings export on disk. Writes replace the file atomically (write to a
 * sibling, then rename), so a crash mid-write cannot truncate the ledger.
 */
export class FileStore implements Store {
  readonly name: string;
  constructor(private path: string) { this.name = `file ${path}`; }

  private async load(): Promise<{ app?: string; entities: EntityRow[]; events: Row[] } & Record<string, unknown>> {
    const json = JSON.parse(await readFile(this.path, "utf8"));
    if (!Array.isArray(json.events) || !Array.isArray(json.entities)) {
      throw new Error(`${this.path} is not a Virtu export`);
    }
    return json;
  }

  async events() { return (await this.load()).events.map(({ _sync, ...r }: any) => r); }
  async entities() { return (await this.load()).entities; }

  async append(row: Minted<EventKind>) {
    const data = await this.load();
    if (data.events.some(r => r.client_id === row.client_id)) return;
    data.events.push(row as Row);
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.path);
  }
}

/**
 * The synced ledger. Uses a service-role key, which bypasses row-level
 * security — so every query here is scoped to one user by hand, and the key
 * must only ever live on your own machine.
 */
export class SupabaseStore implements Store {
  readonly name = "supabase";
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string, private userId: string) {
    // Realtime is never used here, but the client insists on a WebSocket at
    // construction, and Node 20 has no native one.
    this.db = createClient(url, serviceKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket as any },
    });
  }

  async events() {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from("events").select("*")
        .eq("user_id", this.userId).order("created_at").order("id").range(from, from + 999);
      if (error) throw error;
      out.push(...(data as Row[]));
      if (!data || data.length < 1000) return out;
    }
  }

  async entities() {
    const { data, error } = await this.db.from("entities").select("*").eq("user_id", this.userId);
    if (error) throw error;
    return data as EntityRow[];
  }

  async append(row: Minted<EventKind>) {
    const { error } = await this.db.from("events")
      .upsert({ ...row, user_id: this.userId }, { onConflict: "user_id,client_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
