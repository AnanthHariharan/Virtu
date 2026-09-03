"use client";

import { idb, safe } from "./idb";
import type { Entity } from "./types";

/**
 * First-run seed for the local store.
 *
 * Mirrors supabase/migrations/0002_seed.sql so the app is usable on day one
 * before a database exists. Runs once; `pull()` overwrites these rows by id
 * as soon as Supabase is configured, so the two never fight.
 */

function ent(
  kind: string, slug: string, name: string, ord: number,
  meta: Record<string, any> = {}, state: Record<string, any> = {}
): Entity {
  return {
    id: `local:${kind}:${slug}`, kind: kind as Entity["kind"], slug, name,
    aliases: [], meta, state, ord, archived_at: null, _sync: "pending",
  };
}

const SEED: Entity[] = [
  // ── rites: yours, and correct ──
  ent("rite", "pratah-sandhya", "Prātaḥ sandhyāvandanam", 10, { slot: "morning", japa: true, mantra: "gayatri" }),
  ent("rite", "samidadana-am",  "Samidādāna mantra-pāṭham", 20, { slot: "morning" }),
  ent("rite", "brahma-yajnam",  "Brahma-yajñam", 30, { slot: "morning", portion: true }),
  ent("rite", "madhyahnika",    "Mādhyāhnika mantra-pāṭham", 40, { slot: "afternoon" }),
  ent("rite", "sayam-sandhya",  "Sāyaṃ sandhyāvandanam", 50, { slot: "evening", japa: true, mantra: "gayatri" }),
  ent("rite", "samidadana-pm",  "Samidādānam", 60, { slot: "evening" }),

  // ── commonplace heads ──
  ent("locus", "vedanta", "Vedānta", 10),
  ent("locus", "method",  "Method",  20),
  ent("locus", "craft",   "Craft",   30),
  ent("locus", "nature",  "Nature",  40),
  ent("locus", "history", "History", 50),

  // ── training: PLACEHOLDER, replace with your programme ──
  ent("exercise", "bench-press",    "Bench press",       10, { days: [1], scheme: "4×5" },  { best_weight: 105, best_reps: 3 }),
  ent("exercise", "overhead-press", "Overhead press",    20, { days: [1], scheme: "3×6" },  { best_weight: 62.5, best_reps: 1 }),
  ent("exercise", "incline-db",     "Incline dumbbell",  30, { days: [1], scheme: "3×10" }, { best_weight: 34, best_reps: 8 }),
  ent("exercise", "dips",           "Dips",              40, { days: [1], scheme: "3×max", bodyweight: true }),
  ent("exercise", "deadlift",       "Deadlift",          10, { days: [2], scheme: "3×5" },  { best_weight: 170, best_reps: 3 }),
  ent("exercise", "pull-ups",       "Pull-ups",          20, { days: [2], scheme: "3×max", bodyweight: true }),
  ent("exercise", "barbell-row",    "Barbell row",       30, { days: [2], scheme: "3×8" },  { best_weight: 85, best_reps: 6 }),
  ent("exercise", "barbell-curl",   "Barbell curl",      40, { days: [2], scheme: "2×10" }, { best_weight: 37.5, best_reps: 8 }),
  ent("exercise", "back-squat",     "Back squat",        10, { days: [3], scheme: "3×5" },  { best_weight: 135, best_reps: 3 }),
  ent("exercise", "rdl",            "Romanian deadlift", 20, { days: [3], scheme: "3×8" },  { best_weight: 105, best_reps: 8 }),
  ent("exercise", "leg-press",      "Leg press",         30, { days: [3], scheme: "2×12" }, { best_weight: 240, best_reps: 10 }),
  ent("exercise", "calf-raise",     "Standing calf",     40, { days: [3], scheme: "3×15" }, { best_weight: 85, best_reps: 12 }),
  ent("exercise", "incline-bench",  "Incline bench",     10, { days: [5], scheme: "3×6" },  { best_weight: 90, best_reps: 4 }),
  ent("exercise", "weighted-pull",  "Weighted pull-up",  20, { days: [5], scheme: "3×6" },  { best_weight: 12.5, best_reps: 5 }),
  ent("exercise", "lateral-raise",  "Lateral raise",     30, { days: [5], scheme: "3×15" }, { best_weight: 14, best_reps: 12 }),
  ent("exercise", "front-squat",    "Front squat",       10, { days: [6], scheme: "3×5" },  { best_weight: 100, best_reps: 3 }),
  ent("exercise", "hip-thrust",     "Hip thrust",        20, { days: [6], scheme: "2×10" }, { best_weight: 150, best_reps: 8 }),
  ent("exercise", "leg-raise",      "Hanging leg raise", 30, { days: [6], scheme: "3×12", bodyweight: true }),

  // ── menu: PLACEHOLDER ──
  ent("meal_slot", "pre-rites", "Warm water, soaked almonds",    10, { time: "06:30", label: "before the rites" }),
  ent("meal_slot", "breakfast", "Idli · sāmbār · chutney",        20, { time: "09:00", label: "breakfast" }),
  ent("meal_slot", "lunch",     "Rice · sāmbār · poriyal · curd", 30, { time: "13:00", label: "lunch" }),
  ent("meal_slot", "evening",   "Fruit · nuts",                   40, { time: "16:30", label: "evening" }),
  ent("meal_slot", "dinner",    "Chapati · sabzi · dāl",          50, { time: "19:30", label: "dinner" }),

  // ── books: samples, delete freely ──
  ent("book", "brahma-sutra-bhasya", "Brahma Sūtra Bhāṣya", 10,
      { author: "Śaṅkarācārya", pages: 720 }, { page: 214 }),
  ent("book", "seeing-like-a-state", "Seeing Like a State", 20,
      { author: "James C. Scott", pages: 445 }, { page: 88 }),

  // brahma-yajñam portions are deliberately absent — see CLAUDE.md
];

export async function bootstrap(): Promise<void> {
  const done = await safe(() => idb.get<{ key: string; value: boolean }>("meta", "seeded"), undefined);
  if (done?.value) return;
  await safe(() => idb.putAll("entities", SEED), undefined);
  await safe(() => idb.put("meta", { key: "seeded", value: true }), undefined);
}
