import { describe, expect, it } from "vitest";
import { buildInbox, acceptedTargets, latestJudgments, type Judgment } from "./inbox";
import { ev, SAMPLES } from "@/test/fixtures";
import type { Proposal } from "./schema";

const note = (payload: Partial<typeof SAMPLES.note> = {}) => ev("note", { ...SAMPLES.note, ...payload });
const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  kind: "set", payload: {}, confidence: 0.8, complete: true, missing: [], ...over,
});
const judge = (target: string, action: "auto" | "suggest" | "leave", p: Proposal | null, recorded = "2026-09-01T12:00:00Z") =>
  ev("judgment", { target, task: "triage", model: "jev-1.13.0", answers: {}, proposal: p, action },
     { recorded_at: recorded }) as unknown as Judgment;
const verdict = (j: { client_id: string }, target: string, accepted: boolean) =>
  ev("verdict", { judgment: j.client_id, target, accepted });

describe("buildInbox", () => {
  it("an unjudged capture is waiting", () => {
    const c = ev("capture", { text: "hm" });
    const { items } = buildInbox([c], [], [], []);
    expect(items).toEqual([{ capture: c, judgment: null, state: "waiting" }]);
  });

  it("classifies judged captures by what was proposed", () => {
    const a = ev("capture", { text: "a" }), b = ev("capture", { text: "b" }), c = ev("capture", { text: "c" });
    const js = [
      judge(a.client_id, "suggest", proposal()),
      judge(b.client_id, "suggest", proposal({ complete: false, missing: ["reps"] })),
      judge(c.client_id, "leave", null),
    ];
    const states = buildInbox([a, b, c], [], js, []).items.map(i => i.state);
    expect(states).toEqual(["suggest", "incomplete", "unclear"]);
  });

  it("an accepted proposal leaves the inbox and files the capture", () => {
    const c = ev("capture", { text: "squat 65 for 8" });
    const j = judge(c.client_id, "suggest", proposal());
    const v = verdict(j, c.client_id, true);
    expect(buildInbox([c], [], [j], [v]).items).toEqual([]);
    expect(acceptedTargets([v])).toEqual(new Set([c.client_id]));
  });

  it("a refused proposal goes back to Commonplace, not the inbox", () => {
    const c = ev("capture", { text: "x" });
    const j = judge(c.client_id, "suggest", proposal());
    expect(buildInbox([c], [], [j], [verdict(j, c.client_id, false)]).items).toEqual([]);
  });

  it("reads the latest judgment when a capture was judged twice", () => {
    const c = ev("capture", { text: "x" });
    const old = judge(c.client_id, "leave", null, "2026-09-01T10:00:00Z");
    const fresh = judge(c.client_id, "suggest", proposal(), "2026-09-01T11:00:00Z");
    expect(latestJudgments([fresh, old]).get(c.client_id)).toBe(fresh);
    expect(buildInbox([c], [], [old, fresh], []).items[0].state).toBe("suggest");
  });

  it("lists notes Jev filed on its own until you answer them", () => {
    const c = ev("capture", { text: "Structure is the ornament." });
    const j = judge(c.client_id, "auto", proposal({ kind: "note" }));
    const n = note({ files: c.client_id });
    const first = buildInbox([c], [n], [j], []);
    expect(first.items).toEqual([]);                 // filed, so not waiting
    expect(first.auto).toEqual([{ capture: c, judgment: j, note: n }]);

    const answered = buildInbox([c], [n], [j], [verdict(j, c.client_id, true)]);
    expect(answered.auto).toEqual([]);
  });

  it("an undone auto-filing does not linger once its note is struck", () => {
    const c = ev("capture", { text: "x" });
    const j = judge(c.client_id, "auto", proposal({ kind: "note" }));
    // the note has been struck, so it is absent from the resolved log
    expect(buildInbox([c], [], [j], []).auto).toEqual([]);
  });

  it("ignores judgments from other tasks", () => {
    const c = ev("capture", { text: "x" });
    const other = ev("judgment", { ...SAMPLES.judgment, target: c.client_id, task: "reflection" }) as unknown as Judgment;
    expect(buildInbox([c], [], [other], []).items[0].state).toBe("waiting");
  });
});
