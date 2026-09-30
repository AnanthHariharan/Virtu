import { describe, expect, it } from "vitest";
import { guardRequest, decideGuard, GUARD_GATES } from "./guard";
import { mintEvent } from "./event";

const noul = (n: number) => ({ type: "noul" as const, noul: n });

describe("guardRequest", () => {
  it("puts the words and the entry side by side, and asks three yes/no questions", () => {
    const { state, questions } = guardRequest("slept 6h",
      { kind: "measure", payload: { metric: "sleep", value: 6 }, occurred_at: "2026-09-30T14:00:00Z" }, "2026-09-30");
    expect(state).toEqual({
      said: "slept 6h", today: "2026-09-30",
      entry: { kind: "measure", metric: "sleep", value: 6, occurred_at: "2026-09-30T14:00:00Z" },
    });
    expect(Object.values(questions).every(q => q.type === "noul")).toBe(true);
    expect(Object.keys(questions)).toEqual(["matches", "plausible", "when"]);
  });
});

describe("decideGuard", () => {
  it("passes only when every check clears its gate", () => {
    expect(decideGuard({ matches: noul(0.9), plausible: noul(0.9), when: noul(0.9) }).ok).toBe(true);
    const d = decideGuard({ matches: noul(GUARD_GATES.matches - 0.01), plausible: noul(0.9), when: noul(0.2) });
    expect(d.ok).toBe(false);
    expect(d.reasons).toHaveLength(2);
  });

  it("a missing answer is a refusal, not a pass", () => {
    const d = decideGuard({ matches: noul(1) });
    expect(d.ok).toBe(false);
    expect(d.scores).toEqual({ matches: 1, plausible: null, when: null });
  });
});

describe("mintEvent", () => {
  it("mints both timestamps, a client id, and the local day of when it happened", () => {
    const e = mintEvent("measure", { metric: "w", name: "W", value: 1, unit: "kg" }, {
      occurredAt: new Date("2026-09-29T21:30:00-07:00"), now: new Date("2026-09-30T08:00:00-07:00"), source: "agent",
    });
    expect(e.local_date).toBe("2026-09-29");
    expect(e.recorded_at).toBe("2026-09-30T15:00:00.000Z");
    expect(e.client_id).not.toBe(e.id);
    expect(e).toMatchObject({ status: "confirmed", source: "agent", raw: null });
    expect(mintEvent("capture", { text: "x" }).status).toBe("raw");
  });
});
