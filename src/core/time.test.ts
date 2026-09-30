import { describe, expect, it } from "vitest";
import { localDate, addDays, streak, e1rm, slotFor } from "./time";

describe("localDate", () => {
  it("is the user's calendar day, not UTC's, in the evening west of Greenwich", () => {
    // 21:30 in Los Angeles on the 1st is already the 2nd in UTC.
    const evening = new Date("2026-09-01T21:30:00-07:00");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(localDate(evening)).toBe("2026-09-01");
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("survives the daylight-saving change", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});

describe("streak", () => {
  const days = new Set(["2026-09-01", "2026-09-02", "2026-09-03"]);
  const has = (d: string) => days.has(d);

  it("counts consecutive days ending today", () => {
    expect(streak(has, "2026-09-03")).toBe(3);
  });

  it("an unfinished today does not break yesterday's run", () => {
    expect(streak(has, "2026-09-04")).toBe(3);
  });

  it("a missed yesterday ends it", () => {
    expect(streak(has, "2026-09-05")).toBe(0);
  });
});

describe("e1rm", () => {
  it("is Epley, rounded", () => {
    expect(e1rm(100, 5)).toBe(117);
  });

  it("is zero for bodyweight or no reps", () => {
    expect(e1rm(0, 10)).toBe(0);
    expect(e1rm(100, 0)).toBe(0);
  });
});

describe("slotFor", () => {
  it("before four in the morning still belongs to the night", () => {
    expect(slotFor(new Date(2026, 8, 1, 2))).toBe("night");
    expect(slotFor(new Date(2026, 8, 1, 4))).toBe("morning");
    expect(slotFor(new Date(2026, 8, 1, 12))).toBe("midday");
    expect(slotFor(new Date(2026, 8, 1, 18))).toBe("evening");
  });
});
