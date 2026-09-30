import { describe, expect, it } from "vitest";
import { reflectionRequest, reflectionFeatures, SCALES, SIGNALS, FEATURE_GATES } from "./reflection";
import type { Answer } from "./schema";

const score = (s: number, confidence = 0.9): Answer =>
  ({ type: "score", score: s, confidence, probabilities: { [String(Math.round(s))]: confidence } });
const noul = (n: number): Answer => ({ type: "noul", noul: n });

describe("reflectionRequest", () => {
  it("asks every scale and signal at once, over the line alone", () => {
    const { state, questions } = reflectionRequest("A long day.");
    expect(state).toEqual({ reflection: "A long day.", covers: "a day" });
    expect(Object.keys(questions).sort()).toEqual([...Object.keys(SCALES), ...Object.keys(SIGNALS)].sort());
  });

  it("scales describe situations, one per level, at least three levels", () => {
    const { questions } = reflectionRequest("x");
    for (const id of Object.keys(SCALES)) {
      const q = questions[id];
      expect(q.type).toBe("score");
      expect(q.criteria!.length).toBeGreaterThanOrEqual(3);
      // Jev never sees a level's number, so none may lean on one
      for (const level of q.criteria!) expect(level).not.toMatch(/\d|previous|next/);
    }
  });

  it("says when it covers a week", () => {
    expect(reflectionRequest("x", "week").state.covers).toBe("a week");
  });
});

describe("reflectionFeatures", () => {
  it("normalises a score across its levels", () => {
    const f = reflectionFeatures({ energy: score(3), mood: score(0), stress: score(1.5) });
    expect(f.energy).toBe(1);
    expect(f.mood).toBe(0);
    expect(f.stress).toBe(0.5);
  });

  it("an unsure score is no reading at all", () => {
    expect(reflectionFeatures({ energy: score(2, FEATURE_GATES.score - 0.01) }).energy).toBeNull();
  });

  it("a signal is true, false, or undecided in the middle", () => {
    const f = reflectionFeatures({ pain: noul(0.92), skipped: noul(0.05), person: noul(0.5) });
    expect(f.pain).toBe(true);
    expect(f.skipped).toBe(false);
    expect(f.person).toBeNull();
    expect(f.gratitude).toBeNull();
  });

  it("ignores an answer of the wrong type", () => {
    expect(reflectionFeatures({ energy: noul(1), pain: score(3) })).toMatchObject({ energy: null, pain: null });
  });
});
