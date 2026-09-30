import { describe, expect, it } from "vitest";
import { examples, reliability, ece, sweep, suggestThreshold, replay, type Example } from "./lab";
import { GATES, mergeGates, gateAction } from "./triage";
import type { Answer, Proposal } from "./schema";
import { ev } from "@/test/fixtures";

const choice = (c: string, confidence: number): Answer =>
  ({ type: "choice", choice: c, confidence, probabilities: { [c]: confidence } });

const setProposal: Proposal = {
  kind: "set", confidence: 0.8, complete: true, missing: [],
  payload: { exercise: "squat", name: "Squat", weight: 65, reps: 8, unit: "lb" },
};
const noteProposal: Proposal = {
  kind: "note", confidence: 0.85, complete: true, missing: [],
  payload: { text: "t", head: "craft", headName: "Craft", source: null, sourceName: null, files: "c" },
};

function judged(p: Proposal, answers: Record<string, Answer>, action = "suggest") {
  return ev("judgment", { target: "cap", task: "triage", model: "jev-1.13.0", answers, proposal: p, action: action as any });
}
const verdict = (j: { client_id: string }, accepted: boolean, wrote?: string, at = "2026-09-01T12:00:00Z") =>
  ev("verdict", { judgment: j.client_id, target: "cap", accepted, ...(wrote ? { wrote } : {}) }, { recorded_at: at });

const setAnswers = { kind: choice("set", 0.95), exercise: choice("squat", 0.8), weight: choice("n0", 0.9), reps: choice("n1", 0.85) };

describe("examples", () => {
  it("an unanswered judgment is not a label", () => {
    const j = judged(setProposal, setAnswers);
    expect(examples([j], [], [])).toEqual({ proposals: [], fields: [] });
  });

  it("accepted unchanged: the proposal and every field were right", () => {
    const j = judged(setProposal, setAnswers);
    const wrote = ev("set", setProposal.payload as any);
    const { proposals, fields } = examples([j], [verdict(j, true, wrote.client_id)], [wrote]);
    expect(proposals).toEqual([expect.objectContaining({ question: "proposal", confidence: 0.8, correct: true, kind: "set" })]);
    expect(fields.map(f => [f.question, f.correct])).toEqual([["exercise", true], ["weight", true], ["reps", true]]);
  });

  it("an amended weight marks the proposal and the weight wrong, and only those", () => {
    const j = judged(setProposal, setAnswers);
    const wrote = ev("set", { ...setProposal.payload, weight: 67.5 } as any);
    const { proposals, fields } = examples([j], [verdict(j, true, wrote.client_id)], [wrote]);
    expect(proposals[0].correct).toBe(false);
    expect(Object.fromEntries(fields.map(f => [f.question, f.correct]))).toEqual({ exercise: true, weight: false, reps: true });
    expect(fields.find(f => f.question === "weight")!.confidence).toBe(0.9);
  });

  it("a refusal is a wrong proposal with no field labels", () => {
    const j = judged(setProposal, setAnswers);
    const { proposals, fields } = examples([j], [verdict(j, false)], []);
    expect(proposals.map(p => p.correct)).toEqual([false]);
    expect(fields).toEqual([]);
  });

  it("a refiled note: wrong proposal, wrong head", () => {
    const j = judged(noteProposal, { kind: choice("note", 0.9), head: choice("craft", 0.75) }, "auto");
    const fixed = ev("note", { ...noteProposal.payload, head: "method", headName: "Method" } as any);
    const { proposals, fields } = examples([j], [verdict(j, false, fixed.client_id)], [fixed]);
    expect(proposals[0]).toMatchObject({ correct: false, action: "auto" });
    expect(fields).toEqual([expect.objectContaining({ question: "head", correct: false, confidence: 0.75 })]);
  });

  it("a note kept as filed is right", () => {
    const j = judged(noteProposal, { kind: choice("note", 0.9), head: choice("craft", 0.75) }, "auto");
    const note = ev("note", noteProposal.payload as any);
    expect(examples([j], [verdict(j, true, note.client_id)], [note]).proposals[0].correct).toBe(true);
  });

  it("the latest verdict on a judgment is the one that counts", () => {
    const j = judged(setProposal, setAnswers);
    const wrote = ev("set", setProposal.payload as any);
    const early = verdict(j, false, undefined, "2026-09-01T10:00:00Z");
    const late = verdict(j, true, wrote.client_id, "2026-09-01T11:00:00Z");
    expect(examples([j], [late, early], [wrote]).proposals[0].correct).toBe(true);
  });

  it("ignores reflection judgments and ones with no proposal", () => {
    const r = ev("judgment", { target: "r", task: "reflection", model: "m", answers: {}, proposal: null, action: "record" });
    const leave = ev("judgment", { target: "c", task: "triage", model: "m", answers: {}, proposal: null, action: "leave" });
    expect(examples([r, leave], [verdict(r, true), verdict(leave, false)], []).proposals).toEqual([]);
  });
});

const ex = (confidence: number, correct: boolean): Example =>
  ({ question: "proposal", confidence, correct, model: "m", kind: "note", action: "suggest" });

describe("reliability and ECE", () => {
  it("bins by stated confidence and reports observed accuracy", () => {
    const xs = [ex(0.85, true), ex(0.82, true), ex(0.88, false), ex(0.95, true), ex(1, true), ex(0.55, false)];
    const bins = reliability(xs);
    expect(bins.map(b => [b.from, b.n])).toEqual([[0.5, 1], [0.8, 3], [0.9, 2]]);
    expect(bins[1].accuracy).toBeCloseTo(2 / 3);
    expect(bins[1].confidence).toBeCloseTo(0.85);
  });

  it("a perfectly calibrated set has zero error; an overconfident one does not", () => {
    const calibrated = [...Array(8).fill(ex(0.8, true)), ...Array(2).fill(ex(0.8, false))];
    expect(ece(reliability(calibrated))).toBeCloseTo(0, 6);
    const over = Array(10).fill(ex(0.9, false));
    expect(ece(reliability(over))).toBeCloseTo(0.9, 6);
  });

  it("no labels, no error", () => {
    expect(ece([])).toBeNull();
  });
});

describe("sweep and suggestThreshold", () => {
  const xs = [
    ...Array(10).fill(ex(0.95, true)),
    ...Array(5).fill(ex(0.85, true)), ...Array(5).fill(ex(0.85, false)),
    ...Array(5).fill(ex(0.6, false)),
  ];

  it("coverage falls and precision rises as the line goes up", () => {
    const [at6, at9] = sweep(xs, [0.6, 0.9]);
    expect(at6).toMatchObject({ n: 25, coverage: 1, precision: 15 / 25 });
    expect(at9).toMatchObject({ n: 10, coverage: 0.4, precision: 1 });
  });

  it("suggests the lowest line that meets the target with enough evidence", () => {
    expect(suggestThreshold(sweep(xs))).toBe(0.9);
    expect(suggestThreshold(sweep(xs), 0.9, 11)).toBeNull();
  });
});

describe("replay", () => {
  it("re-decides stored judgments under other gates without writing", () => {
    const answers = { kind: choice("note", 0.85), head: choice("craft", 0.75) };
    const j = judged(noteProposal, answers, "auto");
    expect(replay([j], GATES)).toEqual({ total: 1, changed: [] });
    const stricter = mergeGates({ autoNote: { kind: 0.9 } });
    expect(replay([j], stricter).changed).toEqual([{ client_id: j.client_id, target: "cap", from: "auto", to: "suggest" }]);
  });
});

describe("gates", () => {
  it("mergeGates keeps defaults for anything missing or out of range", () => {
    expect(mergeGates(null)).toEqual(GATES);
    expect(mergeGates({ floor: 2, field: "x", autoNote: { head: 0.9 } })).toEqual({ ...GATES, autoNote: { ...GATES.autoNote, head: 0.9 } });
  });

  it("gateAction agrees with the defaults on a plan, a note, and a low floor", () => {
    expect(gateAction(setProposal, { kind: choice("set", 0.9), happened: { type: "noul", noul: 0.1 } })).toBe("leave");
    expect(gateAction(noteProposal, { kind: choice("note", 0.9), head: choice("craft", 0.8) })).toBe("auto");
    expect(gateAction(noteProposal, { kind: choice("note", 0.4) })).toBe("leave");
  });
});
