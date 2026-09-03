/**
 * The training programme. Bump VERSION after editing to reseed.
 *
 * A session is a named day of work rather than a bare list of exercises
 * tagged with weekday numbers. That distinction matters: a session can be run
 * on a day it was not scheduled for — you miss Monday and press Push on
 * Tuesday — and the ledger records which session a set belonged to.
 *
 *   days:  0 = Sunday … 6 = Saturday. Empty means "on demand only".
 *   reps:  a number, a [low, high] range, or "max" for a set to failure.
 *   load:  the working weight as the bar or the machine shows it.
 *
 * Replace the sessions below with your own. Nothing else in the app changes.
 */
export const VERSION = 3;

export type Unit = "kg" | "lb";

/**
 * The label put on every free-weight figure. Machine stacks are numbered on
 * their own scale and that number is recorded as-is; this only names the unit
 * for barbells and dumbbells. One constant — flip it if these are kilos.
 */
export const UNIT: Unit = "lb";

export interface Movement {
  slug: string;
  name: string;
  sets: number;
  /** A number, an inclusive [low, high] range, or "max". */
  reps: number | [number, number] | "max";
  /** The prescription is per side — "3 × 10 each". */
  eachSide?: boolean;
  /** Work measured in minutes rather than repetitions. */
  time?: boolean;
  /** Best recorded working load. Absent where none has been set yet. */
  load?: number;
  /** The load is per hand or per stack — a pair of 30s reads "30 × 2". */
  perSide?: boolean;
  bodyweight?: boolean;
  /** Seconds between sets. */
  rest?: number;
  note?: string;
}

export interface Session {
  slug: string;
  name: string;
  focus: string;
  days: number[];
  movements: Movement[];
}

export const PROGRAM: Session[] = [
  {
    slug: "push-a", name: "Push", focus: "Squat · chest · shoulders · triceps", days: [1],
    movements: [
      { slug: "barbell-squat",   name: "Barbell squat",          sets: 4, reps: [6, 8],   load: 65,  rest: 180 },
      { slug: "db-bench",        name: "DB bench press",         sets: 4, reps: 10,       load: 30,  perSide: true, rest: 150 },
      { slug: "shoulder-press-m", name: "Shoulder press machine", sets: 3, reps: 10,       load: 92,  rest: 120 },
      { slug: "pec-fly",         name: "Pec fly machine",        sets: 3, reps: 12,                  rest: 90 },
      { slug: "cable-lateral",   name: "Cable lateral raise",    sets: 3, reps: [12, 15], load: 70,  rest: 75 },
      { slug: "triceps-pushdown", name: "Triceps pushdown",      sets: 3, reps: 12,       load: 70,  rest: 75 },
    ],
  },
  {
    slug: "pull-a", name: "Pull", focus: "Back · rear delts · biceps, then cardio", days: [2],
    movements: [
      { slug: "lat-pulldown",    name: "Lat pulldown",           sets: 4, reps: [8, 10],  load: 65,   perSide: true, rest: 150 },
      { slug: "seated-cable-row", name: "Seated cable row",      sets: 3, reps: [10, 12], load: 42.5, perSide: true, rest: 120 },
      { slug: "rear-delt-fly",   name: "Rear delt fly machine",  sets: 3, reps: [12, 15], load: 55,   rest: 90 },
      { slug: "db-curl",         name: "DB bicep curl",          sets: 3, reps: [10, 12], load: 25,   perSide: true, rest: 90 },
      { slug: "face-pull",       name: "Cable face pull",        sets: 3, reps: 15,       load: 70,   rest: 75 },
      { slug: "cardio-bike",     name: "Bike or rower",          sets: 1, reps: 20, time: true, note: "20 minutes" },
    ],
  },
  {
    slug: "legs", name: "Legs", focus: "Legs · hips · abs", days: [3],
    movements: [
      { slug: "leg-press",     name: "Leg press",       sets: 4, reps: [10, 12], load: 175, rest: 150 },
      { slug: "leg-curl",      name: "Leg curl",        sets: 3, reps: [10, 12], load: 130, rest: 120 },
      { slug: "leg-extension", name: "Leg extension",   sets: 3, reps: [10, 12], load: 85,  rest: 120 },
      { slug: "hip-abductor",  name: "Hip abductor",    sets: 3, reps: 15,       load: 190, rest: 75 },
      { slug: "hip-adductor",  name: "Hip adductor",    sets: 3, reps: 15,       load: 185, rest: 75 },
      { slug: "crunch-machine", name: "Crunch machine", sets: 3, reps: [15, 20], load: 165, rest: 60 },
      { slug: "woodchop",      name: "Cable woodchop",  sets: 3, reps: 12, eachSide: true,  rest: 60 },
    ],
  },
  {
    slug: "push-b", name: "Push II", focus: "Shoulders · chest · triceps, then cardio", days: [4],
    movements: [
      { slug: "db-shoulder-press", name: "DB shoulder press",       sets: 4, reps: [8, 10],  perSide: true, rest: 150 },
      { slug: "chest-press-m",     name: "Chest press machine",     sets: 3, reps: [10, 12], rest: 120 },
      { slug: "incline-db",        name: "Incline DB press",        sets: 3, reps: [10, 12], perSide: true, rest: 120 },
      { slug: "cable-fly",         name: "Cable fly",               sets: 3, reps: 12,       rest: 90 },
      { slug: "triceps-ext-m",     name: "Triceps extension machine", sets: 3, reps: 12,     rest: 75 },
      { slug: "cardio-bike-2",     name: "Bike or rower",           sets: 1, reps: 20, time: true, note: "20 minutes" },
    ],
  },
  {
    slug: "pull-b", name: "Pull II", focus: "Back · biceps", days: [5],
    movements: [
      { slug: "lat-pulldown-wide", name: "Lat pulldown — wide grip", sets: 4, reps: [8, 10],  load: 125, rest: 150 },
      { slug: "seated-row-narrow", name: "Seated row — narrow grip", sets: 3, reps: [10, 12], load: 165, rest: 120 },
      { slug: "db-row",            name: "DB row — bench supported", sets: 3, reps: 10, eachSide: true, perSide: true, rest: 120 },
      { slug: "bicep-curl-m",      name: "Bicep curl machine",       sets: 3, reps: 12,       rest: 90 },
      { slug: "cable-hammer",      name: "Cable hammer curl",        sets: 3, reps: 12, load: 30, perSide: true, rest: 90 },
    ],
  },
];

export const sessionFor = (dow: number) => PROGRAM.find(s => s.days.includes(dow));

/** "6–8", "10", "max" — the prescription, as written on the card. */
export function repLabel(reps: Movement["reps"]): string {
  if (reps === "max") return "max";
  return Array.isArray(reps) ? `${reps[0]}–${reps[1]}` : String(reps);
}

/** Where a stepper should start when no previous set exists. */
export function repTarget(reps: Movement["reps"]): number {
  if (reps === "max") return 8;
  return Array.isArray(reps) ? reps[0] : reps;
}
