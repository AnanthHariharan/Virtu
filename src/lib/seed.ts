"use client";

import { db, safe, getMeta, setMeta } from "./db";
import type { Entity, EntityKind } from "./types";
import { ANUSHTANAS, VERSION as V_RITES } from "@/data/anushtanas";
import { PROGRAM, UNIT, VERSION as V_PROGRAM } from "@/data/program";
import { MENU, VERSION as V_MENU } from "@/data/menu";
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
 * Reseed a collection only when its version has moved. Existing `state` is
 * preserved: reseeding the programme must not erase a lift's recorded best.
 */
async function collection(key: string, version: number, build: () => Entity[]) {
  if (await getMeta(`seed:${key}`, 0) === version) return;
  const fresh = build();
  const existing = new Map(
    (await safe(() => db.all<Entity>("entities"), [])).map(e => [e.id, e])
  );
  await safe(() => db.putAll("entities", fresh.map(e => ({
    ...e, state: { ...e.state, ...(existing.get(e.id)?.state ?? {}) },
  }))), undefined);
  await setMeta(`seed:${key}`, version);
}

export async function seed(): Promise<void> {
  await collection("rites", V_RITES, () =>
    ANUSHTANAS.map((r, i) => ent("rite", r.slug, r.name, (i + 1) * 10, {
      slot: r.slot, japa: !!r.japa, portion: !!r.portion, note: r.note ?? null,
    }))
  );

  await collection("program", V_PROGRAM, () => [
    ...PROGRAM.map((s, i) => ent("session", s.slug, s.name, (i + 1) * 10, {
      focus: s.focus, days: s.days, movements: s.movements.map(m => m.slug),
    })),
    ...PROGRAM.flatMap(s => s.movements.map((m, i) =>
      ent("exercise", m.slug, m.name, (i + 1) * 10, {
        session: s.slug, sets: m.sets, reps: m.reps, load: m.load ?? 0,
        bodyweight: !!m.bodyweight, rest: m.rest ?? 120, unit: UNIT, note: m.note ?? null,
      }, { load: m.load ?? 0 })
    )),
  ]);

  await collection("menu", V_MENU, () =>
    MENU.map((m, i) => ent("meal", m.slug, m.name, (i + 1) * 10, {
      time: m.time, label: m.label, items: m.items ?? [],
    }))
  );

  await collection("heads", V_HEADS, () => [
    ...HEADS.map((h, i) => ent("head", h.slug, h.name, (i + 1) * 10)),
    ...METRICS.map((m, i) => ent("metric", m.slug, m.name, (i + 1) * 10, {
      unit: m.unit, start: m.start, step: m.step, down: !!m.down,
    })),
  ]);
}
