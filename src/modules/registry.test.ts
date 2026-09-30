import { describe, expect, it } from "vitest";
import { MODULES, moduleOwning, moduleForPath } from "./registry";
import { EVENT_KINDS } from "@/core/schema";
import { ev, SAMPLES } from "@/test/fixtures";

describe("the registry", () => {
  it("every event kind is owned by exactly one module", () => {
    for (const kind of EVENT_KINDS) {
      const owners = MODULES.filter(m => m.owns.includes(kind));
      expect(owners.map(m => m.id), kind).toHaveLength(1);
    }
  });

  it("modules own only kinds the schema knows", () => {
    for (const m of MODULES) for (const k of m.owns) expect(EVENT_KINDS).toContain(k);
  });

  // Judgments and verdicts are about entries, not entries.
  const SILENT = new Set(["judgment", "verdict"]);

  it.each(EVENT_KINDS.filter(k => !SILENT.has(k)))("describes a %s as a line with a title", kind => {
    const line = moduleOwning(kind)!.describe(ev(kind, SAMPLES[kind]));
    expect(line).not.toBeNull();
    expect(line!.title).toBeTruthy();
  });

  it.each([...SILENT])("keeps a %s out of the day's reading", kind => {
    const k = kind as "judgment" | "verdict";
    expect(moduleOwning(k)!.describe(ev(k, SAMPLES[k]))).toBeNull();
  });

  it("an un-observed rite is kept out of the day's reading", () => {
    const line = moduleOwning("rite")!.describe(ev("rite", { ...SAMPLES.rite, observed: false }));
    expect(line).toBeNull();
  });

  it("an un-struck step is kept out of the day's reading", () => {
    const line = moduleOwning("task")!.describe(ev("task", { ...SAMPLES.task, done: false }));
    expect(line).toBeNull();
  });

  it("module ids and paths are unique", () => {
    expect(new Set(MODULES.map(m => m.id)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map(m => m.path)).size).toBe(MODULES.length);
  });

  it("finds the module for a nested path", () => {
    expect(moduleForPath("/anushtanas/japa")?.id).toBe("anushtanas");
    expect(moduleForPath("/")?.id).toBe("today");
    expect(moduleForPath("/settings")).toBeUndefined();
  });
});
