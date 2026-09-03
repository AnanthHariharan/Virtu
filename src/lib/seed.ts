"use client";

import { db, safe, getMeta, setMeta } from "./db";
import type { Entity, EntityKind } from "./types";
import { ANUSHTANAS, PORTIONS, VERSION as V_RITES } from "@/data/anushtanas";
import { PROGRAM, UNIT, VERSION as V_PROGRAM } from "@/data/program";
import { SITTINGS, VERSION as V_MENU } from "@/data/menu";
import { HEADS, METRICS, VERSION as V_HEADS } from "@/data/heads";

/**
 * Turns `src/data` into entity rows in the local store.
 *
 * Each collection is versioned independently. Bump a VERSION in `src/data`
 * and only that collection reseeds on the next app open — your logged events
 * are never touched, because they belong to the ledger rather than to the
 * plan that produced them.
 *
 * Ids are deterministic (`kind:slug`), so a reseed updates rows in place and
 * a later `pull()` from Supabase overwrites them by id without a conflict.
 */

function ent(
  kind: EntityKind, slug: string, name: string, ord: number,
  meta: Record<string, any> = {}, state: Record<string, any> = {}
): Entity {
  return {
    id: `${kind}:${slug}`, kind, slug, name, aliases: [],
    meta, state, ord, archived_at: null, _sync: "pending",
  };
}

/**
 * Reseed a collection only when its version has moved.
 *
 * Two things this must get right, and both are easy to miss:
 *
 *   - Existing `state` survives. Reseeding the programme must not erase a
 *     lift's working load, and reseeding the shelf must not lose a page.
 *   - Rows that have left the data are archived, not orphaned. Replacing five
 *     meals with two sittings has to remove the other three, or they linger
 *     in the interface forever with nothing to render them from.
 */
async function collection(
  key: string, version: number, kinds: EntityKind[], build: () => Entity[]
) {
  if (await getMeta(`seed:${key}`, 0) === version) return;

  const fresh = build();
  const keep = new Set(fresh.map(e => e.id));
  const existing = await safe(() => db.all<Entity>("entities"), []);
  const byId = new Map(existing.map(e => [e.id, e]));

  const retired = existing
    .filter(e => kinds.includes(e.kind) && !keep.has(e.id) && !e.archived_at)
    .map(e => ({ ...e, archived_at: new Date().toISOString(), _sync: "pending" as const }));

  await safe(() => db.putAll("entities", [
    ...fresh.map(e => ({ ...e, state: { ...e.state, ...(byId.get(e.id)?.state ?? {}) } })),
    ...retired,
  ]), undefined);

  await setMeta(`seed:${key}`, version);
}

export async function seed(): Promise<void> {
  await collection("rites", V_RITES, ["rite", "portion"], () => [
    ...ANUSHTANAS.map((r, i) => ent("rite", r.slug, r.name, (i + 1) * 10, {
      slot: r.slot, japa: !!r.japa, portion: !!r.portion, note: r.note ?? null,
    })),
    // The praśnas are ordered, and the order is the cycle.
    ...PORTIONS.map((p, i) => ent("portion", p.slug, p.name, i, { index: i })),
  ]);

  await collection("program", V_PROGRAM, ["session", "exercise"], () => [
    ...PROGRAM.map((s, i) => ent("session", s.slug, s.name, (i + 1) * 10, {
      focus: s.focus, days: s.days, movements: s.movements.map(m => m.slug),
    })),
    ...PROGRAM.flatMap(s => s.movements.map((m, i) =>
      ent("exercise", m.slug, m.name, (i + 1) * 10, {
        session: s.slug, sets: m.sets, reps: m.reps, load: m.load ?? 0,
        perSide: !!m.perSide, eachSide: !!m.eachSide, time: !!m.time,
        bodyweight: !!m.bodyweight, rest: m.rest ?? 120, unit: UNIT,
        note: m.note ?? null,
      }, { load: m.load ?? 0 })
    )),
  ]);

  await collection("menu", V_MENU, ["meal"], () =>
    SITTINGS.map((m, i) => ent("meal", m.slug, m.name, (i + 1) * 10, {
      time: m.time, label: m.label,
    }))
  );

  await collection("heads", V_HEADS, ["head", "metric"], () => [
    ...HEADS.map((h, i) => ent("head", h.slug, h.name, (i + 1) * 10)),
    ...METRICS.map((m, i) => ent("metric", m.slug, m.name, (i + 1) * 10, {
      unit: m.unit, start: m.start, step: m.step, down: !!m.down,
    })),
  ]);
}
