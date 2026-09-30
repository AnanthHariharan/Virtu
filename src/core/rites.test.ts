import { describe, expect, it } from "vitest";
import { observedByDate, observedOn } from "./rites";
import { ev, SAMPLES } from "@/test/fixtures";

const at = (h: number) => new Date(Date.UTC(2026, 8, 1, h)).toISOString();

describe("observedOn", () => {
  it("counts a rite marked observed", () => {
    const e = ev("rite", SAMPLES.rite, { occurred_at: at(14) });
    expect(observedOn([e], "2026-09-01")).toEqual(new Set(["pratah-sandhya"]));
  });

  it("an un-observing after the observing leaves it open", () => {
    const on = ev("rite", SAMPLES.rite, { occurred_at: at(14) });
    const off = ev("rite", { ...SAMPLES.rite, observed: false }, { occurred_at: at(15) });
    // newest-first, as the ledger returns it
    expect(observedOn([off, on], "2026-09-01").size).toBe(0);
  });

  it("re-observing after un-observing counts again", () => {
    const a = ev("rite", SAMPLES.rite, { occurred_at: at(14) });
    const b = ev("rite", { ...SAMPLES.rite, observed: false }, { occurred_at: at(15) });
    const c = ev("rite", SAMPLES.rite, { occurred_at: at(16) });
    expect(observedOn([c, a, b], "2026-09-01").has("pratah-sandhya")).toBe(true);
  });

  it("breaks a tie on occurred_at by recorded_at", () => {
    const on = ev("rite", SAMPLES.rite, { occurred_at: at(14), recorded_at: at(20) });
    const off = ev("rite", { ...SAMPLES.rite, observed: false }, { occurred_at: at(14), recorded_at: at(21) });
    expect(observedOn([on, off], "2026-09-01").size).toBe(0);
  });

  it("keeps days apart and ignores other kinds", () => {
    const d1 = ev("rite", SAMPLES.rite, { local_date: "2026-09-01" });
    const d2 = ev("rite", { ...SAMPLES.rite, slug: "madhyahnika" }, { local_date: "2026-09-02" });
    const other = ev("set", SAMPLES.set);
    const m = observedByDate([d1, d2, other]);
    expect([...m.keys()].sort()).toEqual(["2026-09-01", "2026-09-02"]);
    expect(m.get("2026-09-02")).toEqual(new Set(["madhyahnika"]));
  });
});
