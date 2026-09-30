import { describe, expect, it } from "vitest";
import {
  numberCandidates, asMinutes, triageRequest, decideTriage, storeAnswer, describeProposal,
  GATES, TRIAGE_KINDS, type TriageContext,
} from "./triage";
import { parsePayload, type Answer } from "./schema";

const ctx: TriageContext = {
  heads: [{ slug: "craft", name: "Craft" }, { slug: "method", name: "Method" }],
  books: [{ slug: "gita", name: "Bhagavad Gītā" }],
  exercises: [
    { slug: "barbell-squat", name: "Barbell squat", session: "Push" },
    { slug: "pull-up", name: "Pull-up", session: "Pull", bodyweight: true },
  ],
  activities: [{ slug: "running", name: "Running" }, { slug: "cricket", name: "Cricket" }],
  metrics: [{ slug: "weight", name: "Body weight", unit: "kg" }, { slug: "sleep", name: "Sleep", unit: "h" }],
  projects: ["Virtu", "Essay"],
  unit: "lb",
  distanceUnit: "mi",
};

const choice = (c: string, confidence = 0.9): Answer =>
  ({ type: "choice", choice: c, confidence, probabilities: { [c]: confidence } });
const noul = (n: number): Answer => ({ type: "noul", noul: n });

/** The candidate key whose value is `v`, as the model would choose it. */
const key = (text: string, v: number) => numberCandidates(text).find(c => c.value === v)!.key;

const cap = (text: string) => ({ client_id: "cap-1", text });
const decide = (text: string, answers: Record<string, Answer>) =>
  decideTriage(cap(text), ctx, numberCandidates(text), answers);

describe("numberCandidates", () => {
  it("finds both numbers in 3x10 and keeps plate units", () => {
    const c = numberCandidates("bench 30s 3x10");
    expect(c.map(x => [x.value, x.unit])).toEqual([[30, "s"], [3, null], [10, null]]);
  });

  it("does not read 'hard' as hours", () => {
    expect(numberCandidates("2 hard sets")[0].unit).toBeNull();
  });

  it("reads decimals and units", () => {
    const c = numberCandidates("slept 6.5h, weighed 71.2kg, ran 3.1 mi in 28 min");
    expect(c.map(x => [x.value, x.unit])).toEqual([[6.5, "h"], [71.2, "kg"], [3.1, "mi"], [28, "min"]]);
  });

  it("gives each candidate its surrounding words", () => {
    const [c] = numberCandidates("squat 65 for 8");
    expect(c.context).toContain("squat 65");
  });

  it("caps at twelve", () => {
    expect(numberCandidates(Array.from({ length: 20 }, (_, i) => i).join(" "))).toHaveLength(12);
  });
});

describe("asMinutes", () => {
  it("turns hours into minutes and leaves minutes alone", () => {
    const [h, m] = numberCandidates("1.5h then 20 min");
    expect(asMinutes(h)).toBe(90);
    expect(asMinutes(m)).toBe(20);
  });
});

describe("triageRequest", () => {
  it("sends only the capture and the weekday as state", () => {
    const { state } = triageRequest("hello", ctx, new Date(2026, 8, 30));
    expect(state).toEqual({ capture: "hello", day: "Wednesday" });
  });

  it("asks every question at once, with a none option on every field choice", () => {
    const { questions } = triageRequest("squat 65 for 8", ctx);
    for (const id of ["kind", "happened", "head", "book", "exercise", "activity", "metric", "project",
                      "weight", "reps", "minutes", "distance", "value", "from", "to"]) {
      expect(questions[id], id).toBeDefined();
    }
    for (const [id, q] of Object.entries(questions)) {
      if (q.type !== "choice" || id === "kind") continue;
      expect(Object.keys(q.criteria as object), id).toContain("none");
    }
  });

  it("offers the kinds with contrastive criteria", () => {
    const { questions } = triageRequest("x", ctx);
    expect(Object.keys(questions.kind.criteria as object)).toEqual(TRIAGE_KINDS);
    for (const v of Object.values(questions.kind.criteria as object)) {
      expect(v).toMatchObject({ what: expect.any(String), not_for: expect.any(String) });
    }
  });

  it("asks no number questions when there are no numbers, and skips empty collections", () => {
    const { questions } = triageRequest("a thought", { ...ctx, books: [], heads: [] });
    expect(questions.weight).toBeUndefined();
    expect(questions.book).toBeUndefined();
    expect(questions.head).toBeUndefined();
  });

  it("stays within the Choice limit of 255 options", () => {
    const many = { ...ctx, projects: Array.from({ length: 400 }, (_, i) => `P${i}`) };
    const { questions } = triageRequest("x", many);
    for (const q of Object.values(questions)) {
      if (q.type === "choice") expect(Object.keys(q.criteria as object).length).toBeLessThanOrEqual(255);
    }
  });
});

describe("decideTriage", () => {
  it("files a confident note under a confident head automatically", () => {
    const d = decide("Structure is the ornament", { kind: choice("note", 0.9), head: choice("craft", 0.8) });
    expect(d.action).toBe("auto");
    expect(d.proposal!.payload).toMatchObject({ head: "craft", headName: "Craft", files: "cap-1" });
    expect(parsePayload("note", d.proposal!.payload).ok).toBe(true);
  });

  it("only offers a note when the head is uncertain", () => {
    const d = decide("x", { kind: choice("note", 0.9), head: choice("craft", GATES.autoNote.head - 0.1) });
    expect(d.action).toBe("suggest");
  });

  it("leaves a capture alone below the floor, or when it is 'other'", () => {
    expect(decide("x", { kind: choice("note", GATES.floor - 0.01) }).action).toBe("leave");
    expect(decide("x", { kind: choice("other", 0.99) })).toEqual({ proposal: null, action: "leave" });
    expect(decide("x", {}).action).toBe("leave");
  });

  it("never files a set without asking, and builds a valid one from the numbers typed", () => {
    const t = "squat 65 for 8";
    const d = decide(t, {
      kind: choice("set"), happened: noul(0.9), exercise: choice("barbell-squat"),
      weight: choice(key(t, 65)), reps: choice(key(t, 8)),
    });
    expect(d.action).toBe("suggest");
    expect(d.proposal).toMatchObject({ complete: true, missing: [] });
    expect(d.proposal!.payload).toEqual({
      exercise: "barbell-squat", name: "Barbell squat", weight: 65, reps: 8, unit: "lb", session: "Push",
    });
    expect(parsePayload("set", d.proposal!.payload).ok).toBe(true);
  });

  it("a set with no reps is incomplete and says what is missing", () => {
    const d = decide("squat 65", {
      kind: choice("set"), exercise: choice("barbell-squat"), weight: choice("n0"), reps: choice("none"),
    });
    expect(d.proposal).toMatchObject({ complete: false, missing: ["reps"] });
  });

  it("a bodyweight movement needs no weight", () => {
    const t = "pull-ups 10";
    const d = decide(t, { kind: choice("set"), exercise: choice("pull-up"), reps: choice(key(t, 10)), weight: choice("none") });
    expect(d.proposal).toMatchObject({ complete: true });
    expect(d.proposal!.payload.weight).toBe(0);
  });

  it("an unsure field answer counts as unanswered", () => {
    const d = decide("squat 65 for 8", {
      kind: choice("set"), exercise: choice("barbell-squat", GATES.field - 0.1), reps: choice("n1"), weight: choice("n0"),
    });
    expect(d.proposal!.missing).toContain("exercise");
  });

  it("a plan is not a set: figures are left alone when nothing has happened yet", () => {
    const t = "squat 100 for 5 next week";
    const d = decide(t, {
      kind: choice("set"), happened: noul(0.1), exercise: choice("barbell-squat"),
      weight: choice(key(t, 100)), reps: choice(key(t, 5)),
    });
    expect(d.action).toBe("leave");
    expect(d.proposal).not.toBeNull();
  });

  it("builds an activity, converting hours to minutes", () => {
    const t = "cricket nets 1.5h";
    const d = decide(t, { kind: choice("activity"), activity: choice("cricket"), minutes: choice(key(t, 1.5)) });
    expect(d.proposal!.payload).toEqual({ activity: "cricket", name: "Cricket", minutes: 90 });
    expect(parsePayload("activity", d.proposal!.payload).ok).toBe(true);
  });

  it("builds a run with its distance", () => {
    const t = "ran 3.1 mi in 28 min";
    const d = decide(t, {
      kind: choice("activity"), activity: choice("running"),
      minutes: choice(key(t, 28)), distance: choice(key(t, 3.1)),
    });
    expect(d.proposal!.payload).toMatchObject({ minutes: 28, distance: 3.1, distanceUnit: "mi" });
  });

  it("builds a measure with the metric's unit", () => {
    const t = "weighed 71.2 this morning";
    const d = decide(t, { kind: choice("measure"), metric: choice("weight"), value: choice(key(t, 71.2)) });
    expect(d.proposal!.payload).toEqual({ metric: "weight", name: "Body weight", value: 71.2, unit: "kg" });
    expect(d.proposal!.complete).toBe(true);
  });

  it("builds a reading session", () => {
    const t = "read gita p 10 to 24";
    const d = decide(t, { kind: choice("read"), book: choice("gita"), from: choice(key(t, 10)), to: choice(key(t, 24)) });
    expect(d.proposal!.payload).toEqual({ book: "gita", name: "Bhagavad Gītā", from: 10, to: 24 });
  });

  it("files a task under a known project, or Unsorted", () => {
    const known = decide("draft the intro", { kind: choice("task"), project: choice("p1") });
    expect(known.proposal!.payload).toEqual({ project: "Essay", step: "draft the intro", done: false });
    const unknown = decide("call mum", { kind: choice("task"), project: choice("none") });
    expect(unknown.proposal!.payload.project).toBe("Unsorted");
  });

  it("the proposal's confidence is its least sure answer", () => {
    const t = "squat 65 for 8";
    const d = decide(t, {
      kind: choice("set", 0.95), exercise: choice("barbell-squat", 0.6),
      weight: choice(key(t, 65), 0.9), reps: choice(key(t, 8), 0.8),
    });
    expect(d.proposal!.confidence).toBe(0.6);
  });
});

describe("storeAnswer", () => {
  it("drops the Score legend and keeps what code reads", () => {
    const s = storeAnswer({ type: "score", score: 1, confidence: 1, legend: { 0: "a" }, probabilities: { 0: 0, 1: 1 } });
    expect(s).toEqual({ type: "score", score: 1, confidence: 1, probabilities: { 0: 0, 1: 1 } });
  });

  it("refuses what it does not know", () => {
    expect(storeAnswer({ type: "essay" })).toBeNull();
    expect(storeAnswer(null)).toBeNull();
  });
});

describe("describeProposal", () => {
  it("reads a set as a line", () => {
    expect(describeProposal({
      kind: "set", confidence: 1, complete: true, missing: [],
      payload: { name: "Barbell squat", weight: 65, reps: 8 },
    })).toBe("Set · Barbell squat · 65 × 8");
  });
});
