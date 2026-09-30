import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { z } from "zod";
import { EVENT_KINDS } from "@/core/schema";
import { createTools, type Deps } from "./tools";
import { FileStore, SupabaseStore, type Store } from "./store";

/**
 * Virtu as an MCP server: the ledger as something an agent can ask about,
 * and — carefully — write to.
 *
 *   npm run mcp
 *
 * Configure with one of:
 *   VIRTU_EXPORT=/path/to/virtu-export.json            (a Settings export)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VIRTU_USER_ID
 * and, for guarded writes, TYPESAFE_API_KEY.
 */

const json = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x, null, 2) }] });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("A calendar day, YYYY-MM-DD");

export function buildServer(deps: Deps): McpServer {
  const tools = createTools(deps);
  const server = new McpServer({ name: "virtu", version: "1.0.0" });
  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool("summary", {
    description: "What the ledger holds: counts by kind, the span of days, and whether writes are guarded.",
    annotations: read,
  }, async () => json(await tools.summary()));

  server.registerTool("events", {
    description: "Entries from the ledger, newest first, corrections resolved. Filter by kind and a range of days.",
    inputSchema: {
      kind: z.enum(EVENT_KINDS as [string, ...string[]]).optional(),
      from: date.optional(), to: date.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    annotations: read,
  }, async q => json(await tools.events(q)));

  server.registerTool("day", {
    description: "Everything entered on one day, as the Today page reads it. Defaults to today.",
    inputSchema: { date: date.optional() },
    annotations: read,
  }, async q => json(await tools.day(q)));

  server.registerTool("account", {
    description: "What is owed: open threads computed from the ledger, ranked by weight × urgency, with the arithmetic.",
    inputSchema: { date: date.optional() },
    annotations: read,
  }, async q => json(await tools.account(q)));

  server.registerTool("week", {
    description: "The seven days ending on a date against the seven before: rites, sets, volume, minutes, pages, notes, steps, reflections.",
    inputSchema: { date: date.optional() },
    annotations: read,
  }, async q => json(await tools.week(q)));

  server.registerTool("forecast", {
    description: "Tomorrow's sleep, or whether every rite will be kept, predicted from the days so far — with the " +
      "held-out error against always guessing the average, and what moves it. Says plainly when it has learned nothing.",
    inputSchema: { target: z.enum(["sleep", "rites"]), date: date.optional() },
    annotations: read,
  }, async q => json(await tools.forecast(q)));

  server.registerTool("search", {
    description: "Notes, captures and reflections containing every word of the query.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).optional() },
    annotations: read,
  }, async q => json(await tools.search(q)));

  server.registerTool("capture", {
    description: "Drop a line of free text into the inbox, where it waits for triage and for the user. " +
      "The safe way to record anything you are not certain how to shape.",
    inputSchema: { text: z.string().min(1).max(2000) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async q => json(await tools.capture(q)));

  server.registerTool("log_event", {
    description: "Write one shaped entry (a set, a measure, a rite …). The payload must fit the kind's schema, and " +
      "`said` must be the user's own words. The entry is checked against those words before it is written; " +
      "if the check fails nothing is written and the reasons are returned. Never invent a figure the user did not say.",
    inputSchema: {
      kind: z.enum(EVENT_KINDS as [string, ...string[]]),
      payload: z.record(z.string(), z.unknown()).describe("The payload for this kind, exactly as the schema defines it"),
      said: z.string().min(1).describe("The user's own words this entry records"),
      occurred_at: z.string().optional().describe("ISO time it happened, if not now"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async q => json(await tools.log_event(q)));

  return server;
}

export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store {
  if (env.VIRTU_EXPORT) return new FileStore(env.VIRTU_EXPORT);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.VIRTU_USER_ID) {
    return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.VIRTU_USER_ID);
  }
  throw new Error("Set VIRTU_EXPORT, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + VIRTU_USER_ID.");
}

async function main() {
  const server = buildServer({
    store: storeFromEnv(),
    jev: process.env.TYPESAFE_API_KEY ? new TypeSafeClient({ timeout: 10_000 }) : null,
    unguarded: process.env.VIRTU_MCP_UNGUARDED === "1",
  });
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && /mcp[\\/]server\.ts$/.test(process.argv[1])) {
  main().catch(e => { console.error(e); process.exit(1); });
}
