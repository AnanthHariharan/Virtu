import { describe, expect, it } from "vitest";
import { EVENT_KINDS, parsePayload, isKind } from "./schema";
import { SAMPLES } from "@/test/fixtures";

describe("parsePayload", () => {
  it.each(EVENT_KINDS)("accepts a valid %s", kind => {
    const r = parsePayload(kind, SAMPLES[kind]);
    expect(r.ok).toBe(true);
  });

  it("refuses an unknown kind", () => {
    const r = parsePayload("workout", { reps: 5 });
    expect(r).toEqual({ ok: false, error: "unknown event kind: workout" });
  });

  it("refuses a misspelled key rather than carrying it", () => {
    const r = parsePayload("set", { ...SAMPLES.set, rep: 5 });
    expect(r.ok).toBe(false);
  });

  it("refuses a wrong type", () => {
    const r = parsePayload("set", { ...SAMPLES.set, weight: "heavy" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/weight/);
  });

  it("refuses a negative count and a non-finite number", () => {
    expect(parsePayload("set", { ...SAMPLES.set, reps: -1 }).ok).toBe(false);
    expect(parsePayload("measure", { ...SAMPLES.measure, value: Infinity }).ok).toBe(false);
  });

  it("refuses a slot or status outside its enum", () => {
    expect(parsePayload("rite", { ...SAMPLES.rite, slot: "dawn" }).ok).toBe(false);
    expect(parsePayload("piece", { ...SAMPLES.piece, status: "abandoned" }).ok).toBe(false);
  });

  it("accepts the correction fields on any kind", () => {
    const r = parsePayload("set", { ...SAMPLES.set, corrects: "c-1", void: true });
    expect(r.ok).toBe(true);
  });

  it("accepts a note filed from a capture", () => {
    expect(parsePayload("note", { ...SAMPLES.note, files: "c-9" }).ok).toBe(true);
  });

  it("isKind knows every kind and nothing inherited", () => {
    for (const k of EVENT_KINDS) expect(isKind(k)).toBe(true);
    expect(isKind("toString")).toBe(false);
    expect(isKind(undefined)).toBe(false);
  });
});
