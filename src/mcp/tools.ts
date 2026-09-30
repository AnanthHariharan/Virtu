import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { parsePayload, EVENT_KINDS, type EventKind, type Payloads, type Correction } from "@/core/schema";
import { resolveCorrections } from "@/core/fold";
import { mintEvent } from "@/core/event";
import { decideGuard } from "@/core/guard";
import { threads, week } from "@/core/account";
import { localDate, parseDate, slotFor } from "@/core/time";
import { judge } from "@/lib/jev-server";
import { moduleOwning } from "@/modules/registry";
import { sessionFor, UNIT } from "@/data/program";
import type { Store, Row } from "./store";

/**
 * What an agent may do with the ledger, as plain functions over a store.
 *
 * Reads are generous: the day, any slice of history, the account, the week,
 * a search. Writes are narrow. `capture` drops a line into the inbox, where
 * it waits for triage and for you — the safe default for anything an agent
 * is unsure how to shape. `log_event` writes a shaped entry, and only after
 * the schema accepts the payload AND Jev's guard agrees it records what the
 * user said (see core/guard). The guard's answers are written beside the
 * entry as a judgment, so every agent write carries its justification.
 */

export interface Deps {
  store: Store;
  /** Null when no TypeSafe key is configured. */
  jev: Pick<TypeSafeClient, "systemOne"> | null;
  now?: () => Date;
  /** Write without the guard. Only for a ledger you are willing to have wrong. */
  unguarded?: boolean;
}

type Out = Record<string, unknown>;

export function createTools(deps: Deps) {
  const now = () => deps.now?.() ?? new Date();

  async function standing(): Promise<Row[]> {
    const rows = resolveCorrections(await deps.store.events());
    return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  const line = (e: Row) => {
    const d = moduleOwning(e.kind as EventKind)?.describe(e as any);
    return d ? [d.title, d.meta, d.value].filter(Boolean).join(" · ") : null;
  };
  const show = (e: Row) => ({
    client_id: e.client_id, kind: e.kind, occurred_at: e.occurred_at, local_date: e.local_date,
    source: e.source, line: line(e), payload: e.payload,
  });

  async function entitiesOf(kind: string) {
    return (await deps.store.entities()).filter(e => e.kind === kind && !e.archived_at);
  }

  return {
    async summary(): Promise<Out> {
      const rows = await standing();
      const byKind: Record<string, number> = {};
      for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      const dates = rows.map(r => r.local_date).sort();
      return {
        store: deps.store.name, events: rows.length, byKind,
        first: dates[0] ?? null, last: dates[dates.length - 1] ?? null,
        guard: deps.jev ? "jev" : deps.unguarded ? "off (unguarded)" : "unavailable — log_event refuses",
      };
    },

    async events(q: { kind?: string; from?: string; to?: string; limit?: number }): Promise<Out> {
      const rows = (await standing()).filter(e =>
        (!q.kind || e.kind === q.kind) && (!q.from || e.local_date >= q.from) && (!q.to || e.local_date <= q.to));
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
      return { count: rows.length, events: rows.slice(0, limit).map(show) };
    },

    async day(q: { date?: string }): Promise<Out> {
      const date = q.date ?? localDate(now());
      const rows = (await standing()).filter(e => e.local_date === date);
      return { date, lines: rows.map(e => ({ time: e.occurred_at, kind: e.kind, line: line(e) })).filter(l => l.line) };
    },

    async account(q: { date?: string }): Promise<Out> {
      const date = q.date ?? localDate(now());
      // A past day is judged as it stood that night; today, as it stands now.
      const at = q.date ? new Date(parseDate(date).setHours(21)) : now();
      const [rites, books, metrics] = await Promise.all([entitiesOf("rite"), entitiesOf("book"), entitiesOf("metric")]);
      const session = sessionFor(parseDate(date).getDay());
      const slot = slotFor(at);
      return {
        date, slot,
        threads: threads({
          today: date, slot, events: (await standing()).filter(e => e.local_date <= date),
          rites: rites.map(r => ({ slug: r.slug, name: r.name, slot: String(r.meta?.slot) })),
          session: session ? { name: session.name } : null,
          books: books.map(b => ({ slug: b.slug, name: b.name })),
          metrics: metrics.map(m => ({ slug: m.slug, name: m.name })),
        }),
      };
    },

    async week(q: { date?: string }): Promise<Out> {
      const date = q.date ?? localDate(now());
      const rites = await entitiesOf("rite");
      return { date, lines: week(await standing(), date, rites.length, UNIT) };
    },

    async search(q: { query: string; limit?: number }): Promise<Out> {
      const terms = q.query.toLowerCase().split(/\s+/).filter(Boolean);
      const text = (e: Row) => String(e.payload?.text ?? e.raw ?? "").toLowerCase();
      const hits = (await standing())
        .filter(e => ["note", "capture", "reflection"].includes(e.kind))
        .filter(e => terms.length > 0 && terms.every(t => text(e).includes(t)));
      return { count: hits.length, results: hits.slice(0, Math.min(q.limit ?? 20, 100)).map(show) };
    },

    async capture(q: { text: string }): Promise<Out> {
      const t = q.text.trim();
      if (!t) return { written: false, reason: "empty" };
      const row = mintEvent("capture", { text: t }, { source: "agent", raw: t, now: now() });
      await deps.store.append(row);
      return { written: true, client_id: row.client_id, note: "Waits in the inbox for triage and for you." };
    },

    async log_event(q: { kind: string; payload: unknown; said: string; occurred_at?: string }): Promise<Out> {
      const parsed = parsePayload(q.kind, q.payload);
      if (!parsed.ok) return { written: false, reason: `schema: ${parsed.error}`, kinds: EVENT_KINDS };
      if (["judgment", "verdict"].includes(parsed.kind)) {
        return { written: false, reason: "judgments and verdicts are not an agent's to write" };
      }
      const when = q.occurred_at ? new Date(q.occurred_at) : now();
      if (Number.isNaN(when.getTime())) return { written: false, reason: "occurred_at is not a date" };
      if (when.getTime() > now().getTime() + 5 * 60_000) return { written: false, reason: "occurred_at is in the future" };

      let guard: { model: string; answers: Record<string, any> } | null = null;
      if (deps.jev) {
        const entry = { kind: parsed.kind, payload: parsed.payload as Record<string, unknown>, occurred_at: when.toISOString() };
        const res = await judge({ task: "guard", said: q.said, entry, today: localDate(now()) }, deps.jev);
        const d = decideGuard(res.answers);
        if (!d.ok) return { written: false, reason: `guard: ${d.reasons.join("; ")}`, scores: d.scores, model: res.model };
        guard = res;
      } else if (!deps.unguarded) {
        return {
          written: false,
          reason: "no guard is configured (TYPESAFE_API_KEY). Use `capture` instead, or run with VIRTU_MCP_UNGUARDED=1.",
        };
      }

      const row = mintEvent(parsed.kind, parsed.payload as Payloads[EventKind] & Correction,
                            { source: "agent", raw: q.said, occurredAt: when, now: now() });
      await deps.store.append(row);
      if (guard) {
        await deps.store.append(mintEvent("judgment", {
          target: row.client_id, task: "guard", model: guard.model, answers: guard.answers,
          proposal: null, action: "auto",
        }, { source: "agent", now: now() }));
      }
      return { written: true, client_id: row.client_id, local_date: row.local_date, guarded: !!guard };
    },
  };
}

export type Tools = ReturnType<typeof createTools>;
