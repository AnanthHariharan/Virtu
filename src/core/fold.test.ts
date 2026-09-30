import { describe, expect, it } from "vitest";
import { resolveCorrections } from "./fold";
import { ev, SAMPLES } from "@/test/fixtures";

describe("resolveCorrections", () => {
  it("returns the log untouched when nothing is corrected", () => {
    const log = [ev("set", SAMPLES.set), ev("set", SAMPLES.set)];
    expect(resolveCorrections(log)).toBe(log);
  });

  it("replaces a corrected event with its correction", () => {
    const a = ev("set", { ...SAMPLES.set, weight: 60 });
    const b = ev("set", { ...SAMPLES.set, weight: 65, corrects: a.client_id });
    expect(resolveCorrections([a, b])).toEqual([b]);
  });

  it("resolves a chain: correcting a correction supersedes both", () => {
    const a = ev("set", { ...SAMPLES.set, reps: 3 });
    const b = ev("set", { ...SAMPLES.set, reps: 5, corrects: a.client_id });
    const c = ev("set", { ...SAMPLES.set, reps: 8, corrects: b.client_id });
    expect(resolveCorrections([c, b, a])).toEqual([c]);
  });

  it("strikes a voided event and the void itself", () => {
    const keep = ev("set", SAMPLES.set);
    const a = ev("set", SAMPLES.set);
    const v = ev("set", { ...SAMPLES.set, corrects: a.client_id, void: true });
    expect(resolveCorrections([keep, a, v])).toEqual([keep]);
  });

  it("keeps order and ignores events with no payload", () => {
    const x = ev("capture", null);
    const a = ev("set", SAMPLES.set);
    const y = ev("capture", SAMPLES.capture);
    const b = ev("set", { ...SAMPLES.set, corrects: a.client_id });
    expect(resolveCorrections([x, a, y, b])).toEqual([x, y, b]);
  });

  it("a correction whose target is absent still stands", () => {
    const b = ev("set", { ...SAMPLES.set, corrects: "not-here" });
    expect(resolveCorrections([b])).toEqual([b]);
  });
});
