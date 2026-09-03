/**
 * The training programme. Bump VERSION after editing to reseed.
 *
 * A session is a named day of work — not a bare list of exercises tagged with
 * weekday numbers. That distinction matters: it means a session can be run on
 * a day it was not scheduled for (you missed Monday; you press Push on
 * Tuesday), and it means the ledger records *which session* a set belonged to.
 *
 *   days: 0 = Sunday … 6 = Saturday. An empty array means "on demand only".
 *   reps: a number, or "max" for a set taken to failure.
 *   load: the starting working weight in `UNIT`. Omit for bodyweight work.
 *
 * Replace the sessions below with your actual split. Nothing else changes.
 */
export const VERSION = 1;

export type Unit = "kg" | "lb";
export const UNIT: Unit = "kg";

export interface Movement {
  slug: string;
  name: string;
  sets: number;
  reps: number | "max";
  load?: number;
  bodyweight?: boolean;
  /** Seconds between sets. Drives the rest timer. */
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
    slug: "push", name: "Push", focus: "Chest · shoulders · triceps", days: [1],
    movements: [
      { slug: "bench-press",    name: "Bench press",      sets: 4, reps: 5,     load: 80,  rest: 180 },
      { slug: "overhead-press", name: "Overhead press",   sets: 3, reps: 6,     load: 50,  rest: 150 },
      { slug: "incline-db",     name: "Incline dumbbell", sets: 3, reps: 10,    load: 28,  rest: 120 },
      { slug: "dips",           name: "Dips",             sets: 3, reps: "max", bodyweight: true, rest: 120 },
      { slug: "triceps-push",   name: "Triceps pushdown", sets: 3, reps: 12,    load: 30,  rest: 90 },
    ],
  },
  {
    slug: "pull", name: "Pull", focus: "Back · biceps · posterior chain", days: [2],
    movements: [
      { slug: "deadlift",     name: "Deadlift",     sets: 3, reps: 5,     load: 130, rest: 210 },
      { slug: "pull-ups",     name: "Pull-ups",     sets: 3, reps: "max", bodyweight: true, rest: 150 },
      { slug: "barbell-row",  name: "Barbell row",  sets: 3, reps: 8,     load: 70,  rest: 120 },
      { slug: "face-pull",    name: "Face pull",    sets: 3, reps: 15,    load: 25,  rest: 90 },
      { slug: "barbell-curl", name: "Barbell curl", sets: 3, reps: 10,    load: 30,  rest: 90 },
    ],
  },
  {
    slug: "legs", name: "Legs", focus: "Quads · hamstrings · calves", days: [4],
    movements: [
      { slug: "back-squat",  name: "Back squat",       sets: 4, reps: 5,  load: 100, rest: 210 },
      { slug: "rdl",         name: "Romanian deadlift", sets: 3, reps: 8,  load: 85,  rest: 150 },
      { slug: "leg-press",   name: "Leg press",        sets: 3, reps: 12, load: 180, rest: 120 },
      { slug: "calf-raise",  name: "Standing calf",    sets: 4, reps: 15, load: 70,  rest: 75 },
      { slug: "leg-raise",   name: "Hanging leg raise", sets: 3, reps: 12, bodyweight: true, rest: 75 },
    ],
  },
  {
    slug: "upper", name: "Upper", focus: "Volume · accessories", days: [5],
    movements: [
      { slug: "incline-bench",  name: "Incline bench",    sets: 3, reps: 6,  load: 70, rest: 180 },
      { slug: "weighted-pull",  name: "Weighted pull-up", sets: 3, reps: 6,  load: 10, rest: 150 },
      { slug: "lateral-raise",  name: "Lateral raise",    sets: 4, reps: 15, load: 10, rest: 75 },
      { slug: "chest-fly",      name: "Cable fly",        sets: 3, reps: 12, load: 20, rest: 90 },
    ],
  },
  {
    slug: "conditioning", name: "Conditioning", focus: "Aerobic · on demand", days: [],
    movements: [
      { slug: "run",       name: "Run",           sets: 1, reps: 1, note: "log distance as reps, in hundreds of metres" },
      { slug: "kettlebell", name: "Kettlebell swing", sets: 5, reps: 20, load: 24, rest: 60 },
    ],
  },
];

export const sessionFor = (dow: number) => PROGRAM.find(s => s.days.includes(dow));
export const allMovements = () => PROGRAM.flatMap(s => s.movements.map(m => ({ ...m, session: s.slug })));
