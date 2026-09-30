import { describe, expect, it } from "vitest";
import { days, fit, predict, forecast, MIN_DAYS, FEATURES } from "./model";
import { addDays } from "./time";
import { ev, SAMPLES } from "@/test/fixtures";
import type { Ev } from "./account";

const START = "2026-06-01";
const at = (d: string, h = 12) => ({ local_date: d, occurred_at: `${d}T${String(h).padStart(2, "0")}:00:00.000Z`, recorded_at: `${d}T${String(h).padStart(2, "0")}:00:00.000Z` });
/** A deterministic, unpatterned level 0..3 for day i. */
const level = (i: number) => Math.floor(Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 4);

const sleep = (d: string, value: number) => ev("measure", { metric: "sleep", name: "Sleep", value, unit: "h" }, at(d, 7)) as Ev;

function reflectionWithStress(d: string, s: number): Ev[] {
  const line = ev("reflection", { text: "a day", period: "day" }, at(d, 21)) as Ev;
  const read = ev("judgment", {
    target: line.client_id, task: "reflection", model: "jev-1.13.0", proposal: null, action: "record",
    answers: { stress: { type: "score", score: s, confidence: 0.9, probabilities: {} } },
  }, at(d, 22)) as Ev;
  return [line, read];
}

/** Sleep the next morning falls with the evening's stress, and nothing else. */
function stressLedger(n: number): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(START, i);
    const s = level(i);
    out.push(...reflectionWithStress(d, s));
    out.push(sleep(addDays(d, 1), 8 - 2 * (s / 3)));
  }
  return out;
}

describe("days", () => {
  it("takes features from the day and the target from the next, never the other way", () => {
    const events = [sleep("2026-06-01", 7), sleep("2026-06-02", 6), ev("set", SAMPLES.set, at("2026-06-01")) as Ev];
    const [first] = days(events, 0, "sleep");
    expect(first.date).toBe("2026-06-01");
    expect(first.x.sleep_last).toBe(7);
    expect(first.y).toBe(6);
    expect(first.x.sets).toBe(1);
  });

  it("leaves what the ledger does not say as null rather than inventing it", () => {
    const [row] = days([ev("set", SAMPLES.set, at(START)) as Ev], 0, "sleep");
    expect(row.x.stress).toBeNull();
    expect(row.x.rites).toBeNull();
    expect(row.y).toBeNull();
  });

  it("fills every calendar day in the span, including empty ones", () => {
    const rows = days([sleep("2026-06-01", 7), sleep("2026-06-05", 7)], 0, "sleep");
    expect(rows.map(r => r.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
  });

  it("the rites target is whether every rite was kept the day after", () => {
    const events = [
      ev("rite", { ...SAMPLES.rite, slug: "a" }, at("2026-06-01")) as Ev,
      ev("rite", { ...SAMPLES.rite, slug: "a" }, at("2026-06-02")) as Ev,
      ev("set", SAMPLES.set, at("2026-06-03")) as Ev,
    ];
    const rows = days(events, 1, "rites");
    expect(rows.map(r => r.y)).toEqual([1, 0, null]);
  });
});

describe("forecast", () => {
  it("waits for enough days before fitting anything", () => {
    const r = forecast(stressLedger(10), 0, "sleep", addDays(START, 9));
    expect(r).toMatchObject({ status: "insufficient", score: null, tomorrow: null });
    expect(r.labelled).toBeLessThan(MIN_DAYS);
  });

  it("finds a real relationship, beats the baseline on days it never saw, and names the driver", () => {
    const n = 80;
    const r = forecast(stressLedger(n), 0, "sleep", addDays(START, n - 1));
    expect(r.status).toBe("useful");
    expect(r.metric).toBe("mae");
    expect(r.train + r.test).toBe(r.labelled);
    expect(r.test).toBe(r.labelled - Math.floor(r.labelled * 0.75));
    expect(r.score!).toBeLessThan(r.baseline! * 0.5);
    expect(r.drivers[0]).toMatchObject({ feature: "stress" });
    expect(r.drivers[0].effect).toBeLessThan(0);
    // today's stress is known, so tomorrow's sleep is predicted near the truth
    const s = level(n - 1);
    expect(r.tomorrow!).toBeCloseTo(8 - 2 * (s / 3), 0);
  });

  it("says when it has learned nothing, and then predicts nothing", () => {
    const events: Ev[] = [];
    for (let i = 0; i < 80; i++) {
      const d = addDays(START, i);
      events.push(...reflectionWithStress(d, level(i)));
      events.push(sleep(addDays(d, 1), 6 + level(i * 7 + 3) / 2));   // unrelated to the evening
    }
    const r = forecast(events, 0, "sleep", addDays(START, 79));
    expect(r.status).toBe("no-better");
    expect(r.tomorrow).toBeNull();
  });

  it("learns a binary outcome: training the day before keeps the rites", () => {
    const events: Ev[] = [];
    for (let i = 0; i < 90; i++) {
      const d = addDays(START, i);
      const trained = level(i) >= 2;
      if (trained) events.push(ev("set", SAMPLES.set, at(d, 18)) as Ev);
      if (i > 0 && level(i - 1) >= 2) events.push(ev("rite", { ...SAMPLES.rite, slug: "a" }, at(d, 6)) as Ev);
    }
    const r = forecast(events, 1, "rites", addDays(START, 89));
    expect(r.metric).toBe("brier");
    expect(r.status).toBe("useful");
    expect(r.score!).toBeLessThan(r.baseline!);
    expect(["sets", "volume"]).toContain(r.drivers[0].feature);
    expect(r.drivers[0].effect).toBeGreaterThan(0);
    expect(r.tomorrow!).toBeGreaterThanOrEqual(0);
    expect(r.tomorrow!).toBeLessThanOrEqual(1);
  });
});

describe("fit", () => {
  it("drops features that never vary, and a binary model predicts a probability", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      date: addDays(START, i),
      x: Object.fromEntries(FEATURES.map(f => [f, f === "sets" ? i % 2 : 0])) as any,
      y: i % 2,
    }));
    const m = fit(rows, "rites");
    expect(m.features).toEqual(["sets"]);
    expect(predict(m, rows[1])).toBeGreaterThan(0.5);
    expect(predict(m, rows[0])).toBeLessThan(0.5);
  });

  it("is deterministic", () => {
    const rows = days(stressLedger(40), 0, "sleep");
    expect(fit(rows, "sleep")).toEqual(fit(rows, "sleep"));
  });
});

describe("days, through today", () => {
  it("extends to today even when nothing is logged yet, with no target", () => {
    const rows = days([sleep("2026-06-01", 7)], 0, "sleep", "2026-06-03");
    expect(rows.map(r => r.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(rows[2]).toMatchObject({ y: null, x: { sets: 0 } });
  });
});
