import { describe, expect, it } from "vitest";
import { threads, week, WEIGHTS, LINES, type AccountInput, type Ev } from "./account";
import { addDays } from "./time";
import { ev, SAMPLES } from "@/test/fixtures";

const TODAY = "2026-09-30";
const on = (d: string) => ({ local_date: d, occurred_at: `${d}T12:00:00.000Z`, recorded_at: `${d}T12:00:00.000Z` });
const ago = (n: number) => addDays(TODAY, -n);

const RITES = [
  { slug: "am", name: "Morning rite", slot: "morning" },
  { slug: "pm", name: "Evening rite", slot: "evening" },
];

function input(events: Ev[], over: Partial<AccountInput> = {}): AccountInput {
  return { today: TODAY, slot: "midday", events, rites: RITES, session: null, books: [], metrics: [], ...over };
}
const rite = (slug: string, d: string, observed = true) =>
  ev("rite", { ...SAMPLES.rite, slug, observed }, on(d)) as Ev;
const types = (i: AccountInput) => threads(i).map(t => t.type);

describe("threads", () => {
  it("a clear account has no threads", () => {
    expect(threads(input([rite("am", TODAY)]))).toEqual([]);
  });

  it("a rite whose part of the day has passed is outstanding", () => {
    const [t] = threads(input([]));
    expect(t).toMatchObject({ type: "rites", title: "1 rite outstanding", detail: "Morning rite", href: "/anushtanas" });
    expect(t.score).toBeCloseTo(t.weight * t.urgency, 6);
  });

  it("an un-observed rite is still outstanding", () => {
    const a = ev("rite", { ...SAMPLES.rite, slug: "am", observed: true },
                 { ...on(TODAY), occurred_at: `${TODAY}T08:00:00.000Z` }) as Ev;
    const b = ev("rite", { ...SAMPLES.rite, slug: "am", observed: false },
                 { ...on(TODAY), occurred_at: `${TODAY}T09:00:00.000Z` }) as Ev;
    expect(types(input([a, b]))).toContain("rites");
  });

  it("warns in the evening when a run of full days would break", () => {
    const history = [1, 2, 3, 4].flatMap(n => [rite("am", ago(n)), rite("pm", ago(n))]);
    const t = threads(input([...history, rite("am", TODAY)], { slot: "evening" })).find(x => x.type === "streak")!;
    expect(t.title).toBe("A 4-day run ends tonight");
    expect(t.detail).toBe("1 of 2 rites still open");
    // not before the evening
    expect(types(input([...history, rite("am", TODAY)], { slot: "midday" }))).not.toContain("streak");
  });

  it("an unopened session is a thread only once the evening comes", () => {
    const session = { name: "Legs" };
    expect(types(input([rite("am", TODAY)], { session, slot: "midday" }))).not.toContain("session");
    expect(types(input([rite("am", TODAY)], { session, slot: "evening" }))).toContain("session");
    const moved = ev("activity", SAMPLES.activity, on(TODAY)) as Ev;
    expect(types(input([rite("am", TODAY), moved], { session, slot: "evening" }))).not.toContain("session");
  });

  it("a lapse in training grows with the gap", () => {
    const set = (d: string) => ev("set", SAMPLES.set, on(d)) as Ev;
    expect(types(input([rite("am", TODAY), set(ago(LINES.lapse - 1))]))).not.toContain("lapse");
    const short = threads(input([rite("am", TODAY), set(ago(LINES.lapse))])).find(t => t.type === "lapse")!;
    const long = threads(input([rite("am", TODAY), set(ago(LINES.lapse * 3))])).find(t => t.type === "lapse")!;
    expect(long.urgency).toBeGreaterThan(short.urgency);
    expect(long.urgency).toBeLessThanOrEqual(2);
  });

  it("a project with open steps and no movement has stalled; a finished one has not", () => {
    const step = (project: string, s: string, done: boolean, d: string) =>
      ev("task", { project, step: s, done }, on(d)) as Ev;
    const events = [
      rite("am", TODAY),
      step("Essay", "draft", false, ago(20)),
      step("Done", "ship", false, ago(30)), step("Done", "ship", true, ago(25)),
    ];
    const t = threads(input(events)).filter(x => x.type === "project");
    expect(t.map(x => x.title)).toEqual(["Essay has stalled"]);
    expect(t[0].detail).toBe("1 open, untouched for 20 days");
  });

  it("captures waiting past the line, but not those just made or already filed", () => {
    const old = ev("capture", { text: "old" }, on(ago(LINES.captures))) as Ev;
    const fresh = ev("capture", { text: "fresh" }, on(TODAY)) as Ev;
    const filed = ev("capture", { text: "filed" }, on(ago(9))) as Ev;
    const note = ev("note", { ...SAMPLES.note, files: filed.client_id }, on(ago(9))) as Ev;
    const t = threads(input([rite("am", TODAY), old, fresh, filed, note])).find(x => x.type === "captures")!;
    expect(t.title).toBe("1 capture unfiled");
  });

  it("a book set down and a measure no longer kept; never-kept is not a lapse", () => {
    const read = ev("read", SAMPLES.read, on(ago(LINES.book))) as Ev;
    const weighed = ev("measure", SAMPLES.measure, on(ago(LINES.metric))) as Ev;
    const t = types(input([rite("am", TODAY), read, weighed], {
      books: [{ slug: "gita", name: "Gītā" }, { slug: "unread", name: "Unread" }],
      metrics: [{ slug: "weight", name: "Body weight" }, { slug: "rhr", name: "Resting pulse" }],
    }));
    expect(t.filter(x => x === "book")).toHaveLength(1);
    expect(t.filter(x => x === "metric")).toHaveLength(1);
  });

  it("pain read in a recent line raises the top thread and names the session", () => {
    const line = ev("reflection", SAMPLES.reflection, on(ago(1))) as Ev;
    const j = ev("judgment", {
      target: line.client_id, task: "reflection", model: "jev-1.13.0", proposal: null, action: "record",
      answers: { pain: { type: "noul", noul: 0.9 } },
    }, on(ago(1))) as Ev;
    const [top] = threads(input([rite("am", TODAY), line, j], { session: { name: "Rugby" } }));
    expect(top.type).toBe("pain");
    expect(top.detail).toContain("Rugby");
    // pain is not read into a line Jev was unsure about
    const unsure = { ...j, payload: { ...j.payload, answers: { pain: { type: "noul", noul: 0.5 } } } };
    expect(types(input([rite("am", TODAY), line, unsure]))).not.toContain("pain");
  });

  it("asks for tonight's line in the evening until it is written", () => {
    expect(types(input([rite("am", TODAY), rite("pm", TODAY)], { slot: "evening" }))).toEqual(["reflect"]);
    const line = ev("reflection", SAMPLES.reflection, on(TODAY)) as Ev;
    expect(types(input([rite("am", TODAY), rite("pm", TODAY), line], { slot: "evening" }))).toEqual([]);
  });

  it("ranks by weight × urgency", () => {
    const set = ev("set", SAMPLES.set, on(ago(20))) as Ev;
    const ts = threads(input([set]));
    const scores = ts.map(t => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const t of ts) expect(t.weight).toBe(WEIGHTS[t.type]);
  });
});

describe("week", () => {
  it("compares the last seven days with the seven before", () => {
    const events: Ev[] = [
      ev("set", { ...SAMPLES.set, weight: 100, reps: 5 }, on(TODAY)) as Ev,
      ev("set", { ...SAMPLES.set, weight: 100, reps: 5 }, on(ago(6))) as Ev,
      ev("set", { ...SAMPLES.set, weight: 50, reps: 10 }, on(ago(7))) as Ev,
      ev("read", { ...SAMPLES.read, from: 1, to: 11 }, on(ago(2))) as Ev,
      ev("task", { project: "P", step: "s", done: true }, on(ago(1))) as Ev,
      rite("am", ago(3)), rite("pm", ago(3)), rite("am", ago(4)),
    ];
    const w = Object.fromEntries(week(events, TODAY, 2).map(l => [l.label, [l.now, l.prev]]));
    expect(w["Sets"]).toEqual([2, 1]);
    expect(w["Volume"]).toEqual([1000, 500]);
    expect(w["Pages"]).toEqual([10, 0]);
    expect(w["Steps struck"]).toEqual([1, 0]);
    expect(w["Days all rites kept"]).toEqual([1, 0]);
    expect(w["Energy"]).toEqual([null, null]);
  });

  it("averages what Jev read in the week's lines", () => {
    const a = ev("reflection", SAMPLES.reflection, on(ago(1))) as Ev;
    const b = ev("reflection", SAMPLES.reflection, on(ago(2))) as Ev;
    const read = (target: string, s: number) => ev("judgment", {
      target, task: "reflection", model: "m", proposal: null, action: "record",
      answers: { energy: { type: "score", score: s, confidence: 0.9, probabilities: {} } },
    }, on(TODAY)) as Ev;
    const w = week([a, b, read(a.client_id, 3), read(b.client_id, 0)], TODAY, 0);
    expect(w.find(l => l.label === "Energy")!.now).toBe(50);
  });
});
