/**
 * Commonplace heads, and the measures kept. Bump VERSION to reseed.
 *
 * The commonplace book is the Renaissance personal-knowledge technology:
 * passages filed under topical heads and cross-indexed to their sources.
 * Erasmus, Locke and Milton all kept one. "Learnings under heads" is still a
 * better interface to a knowledge graph than a graph.
 */
export const VERSION = 1;

export interface Head { slug: string; name: string }

export const HEADS: Head[] = [
  { slug: "vedanta",  name: "Vedānta" },
  { slug: "method",   name: "Method" },
  { slug: "craft",    name: "Craft" },
  { slug: "systems",  name: "Systems" },
  { slug: "nature",   name: "Nature" },
  { slug: "history",  name: "History" },
  { slug: "language", name: "Language" },
];

export interface Metric {
  slug: string; name: string; unit: string;
  /** Sensible starting point for the stepper, and its increment. */
  start: number; step: number;
  /** Lower is better — changes the direction of the trend arrow. */
  down?: boolean;
}

export const METRICS: Metric[] = [
  { slug: "weight", name: "Body weight",  unit: "kg",  start: 70, step: 0.1 },
  { slug: "sleep",  name: "Sleep",        unit: "h",   start: 7.5, step: 0.25 },
  { slug: "rhr",    name: "Resting pulse", unit: "bpm", start: 58, step: 1, down: true },
];
