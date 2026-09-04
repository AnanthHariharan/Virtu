/**
 * Physical activity that is not lifting. Bump VERSION after editing.
 *
 * These do not fit the sets-and-reps model and should not be forced into it:
 * an hour of rugby has no working load and eighty minutes of vinyasa has no
 * repetitions. What they all have is TIME, which is why minutes are the one
 * quantity every activity records. Distance is optional and only running
 * asks for it.
 *
 * `modes` is the shape of the session, and it differs by sport — a cricket
 * match and an hour in the nets are not the same entry, and neither is a long
 * run and a set of intervals. Recording which one it was costs a single tap
 * and is the difference between "I ran four times this week" and knowing what
 * those four runs were.
 */
export const VERSION = 1;

/** Loads are in pounds, so distances are in miles. One constant, as with UNIT. */
export const DISTANCE_UNIT = "mi";

export interface Activity {
  slug: string;
  name: string;
  /** Records distance alongside time. */
  distance?: boolean;
  /** Where the stepper starts when there is nothing to copy from. */
  minutes: number;
  /** The shapes this session comes in. The first is the default. */
  modes: string[];
  note?: string;
}

export const ACTIVITIES: Activity[] = [
  {
    slug: "cricket", name: "Cricket", minutes: 120,
    modes: ["Match", "Nets", "Fielding", "Bowling"],
  },
  {
    slug: "rugby", name: "Rugby", minutes: 80,
    modes: ["Match", "Training", "Conditioning", "Touch"],
  },
  {
    slug: "yoga", name: "Vinyasa yoga", minutes: 60,
    modes: ["Led class", "Self-practice", "Restorative"],
  },
  {
    slug: "running", name: "Running", minutes: 30, distance: true,
    modes: ["Easy", "Tempo", "Long", "Intervals"],
  },
];

export const activityBySlug = (slug: string) => ACTIVITIES.find(a => a.slug === slug);

/** Minutes read badly past an hour, and "1h 20m" is how you actually say it. */
export function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}
