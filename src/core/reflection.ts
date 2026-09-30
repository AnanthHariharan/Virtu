import type { Answer } from "./schema";

/**
 * Reading a reflection.
 *
 * The evening line is kept exactly as written. What Jev reads in it is a
 * set of FEATURES: four Scores whose levels describe situations rather than
 * degrees ("got through it, running low", not "moderately tired" — Jev never
 * sees a level's number, only its words), and four Nouls about single,
 * unambiguous facts. None of them decides anything. They become columns
 * that accountability and, later, a predictive model can read.
 *
 * Pure: no browser, no database, no network.
 */

export const SCALES = {
  energy: {
    instructions: "How much energy did the writer have across `reflection`'s day?",
    levels: [
      "Exhausted: struggled to get through the day at all",
      "Tired: got through it, but running low",
      "Steady: an ordinary day's energy",
      "Energetic: sharp and eager for most of the day",
    ],
  },
  mood: {
    instructions: "What was the writer's mood across the day in `reflection`?",
    levels: [
      "Low: sad, flat or irritable most of the day",
      "Mixed: real ups and downs",
      "Content: generally good",
      "Buoyant: happy, light, glad of the day",
    ],
  },
  stress: {
    instructions: "How much pressure was the writer under in `reflection`?",
    levels: [
      "Calm: nothing pressing",
      "Some pressure, and it was manageable",
      "Stretched: worried or rushed for much of the day",
      "Overwhelmed: anxious, unable to switch off",
    ],
  },
  focus: {
    instructions: "How well could the writer concentrate, going by `reflection`?",
    levels: [
      "Scattered: could not settle on anything",
      "Patchy: some focused stretches among distraction",
      "Focused: did the important work",
      "Deep: long, unbroken concentration",
    ],
  },
} as const;

export const SIGNALS = {
  pain: "The writer mentions physical pain, unusual soreness, or an injury.",
  skipped: "The writer says they skipped or missed a practice, prayer, workout or habit.",
  person: "The writer mentions time spent with, or thoughts about, a specific person.",
  gratitude: "The writer expresses gratitude for something.",
} as const;

export type Scale = keyof typeof SCALES;
export type Signal = keyof typeof SIGNALS;

export function reflectionRequest(text: string, period: "day" | "week" = "day") {
  const questions: Record<string, { type: "score" | "noul"; instructions: string; criteria?: readonly string[] }> = {};
  for (const [id, s] of Object.entries(SCALES)) {
    questions[id] = { type: "score", instructions: s.instructions, criteria: s.levels };
  }
  for (const [id, s] of Object.entries(SIGNALS)) {
    questions[id] = { type: "noul", instructions: `${s} (in \`reflection\`)` };
  }
  return { state: { reflection: text, covers: period === "week" ? "a week" : "a day" }, questions };
}

/**
 * The features, normalised. A Score becomes 0..1 across its levels, or null
 * when Jev was unsure (the levels overlap for this text, or it says too
 * little). A Noul becomes true, false, or null in the undecided middle.
 */
export const FEATURE_GATES = { score: 0.5, yes: 0.7, no: 0.3 };

export type Features = { [K in Scale]: number | null } & { [K in Signal]: boolean | null };

export function reflectionFeatures(answers: Record<string, Answer | undefined>): Features {
  const out = {} as Features;
  for (const [id, s] of Object.entries(SCALES) as [Scale, (typeof SCALES)[Scale]][]) {
    const a = answers[id];
    out[id] = a?.type === "score" && a.confidence >= FEATURE_GATES.score
      ? a.score / (s.levels.length - 1)
      : null;
  }
  for (const id of Object.keys(SIGNALS) as Signal[]) {
    const a = answers[id];
    out[id] = a?.type !== "noul" ? null
      : a.noul >= FEATURE_GATES.yes ? true
      : a.noul <= FEATURE_GATES.no ? false
      : null;
  }
  return out;
}
