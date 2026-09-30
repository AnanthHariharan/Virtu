import { describe, expect, it } from "vitest";
import { ANUSHTANAS, PORTIONS, nextPortion } from "./anushtanas";
import { PROGRAM } from "./program";
import { ACTIVITIES } from "./activities";
import { BOWLS, ITEMS, SITTINGS, groceryList } from "./menu";
import { HEADS, METRICS } from "./heads";

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe("the praśna cycle", () => {
  it("begins at the first with nothing recorded", () => {
    expect(nextPortion()).toBe(PORTIONS[0]);
  });

  it("is the one after the last recorded — a missed day costs a day", () => {
    expect(nextPortion(PORTIONS[3].slug)).toBe(PORTIONS[4]);
  });

  it("wraps at the end", () => {
    expect(nextPortion(PORTIONS[PORTIONS.length - 1].slug)).toBe(PORTIONS[0]);
  });

  it("restarts at the first for a praśna no longer in the list", () => {
    expect(nextPortion("retired")).toBe(PORTIONS[0]);
  });
});

describe("src/data is well-formed", () => {
  it("slugs are unique within each collection", () => {
    expect(unique(ANUSHTANAS.map(r => r.slug))).toBe(true);
    expect(unique(PORTIONS.map(p => p.slug))).toBe(true);
    expect(unique(PROGRAM.map(s => s.slug))).toBe(true);
    expect(unique(PROGRAM.flatMap(s => s.movements.map(m => m.slug)))).toBe(true);
    expect(unique(ACTIVITIES.map(a => a.slug))).toBe(true);
    expect(unique(BOWLS.map(b => b.slug))).toBe(true);
    expect(unique(SITTINGS.map(s => s.slug))).toBe(true);
    expect(unique(HEADS.map(h => h.slug))).toBe(true);
    expect(unique(METRICS.map(m => m.slug))).toBe(true);
  });

  it("every bowl ingredient and every mix part is in the ITEMS catalogue", () => {
    for (const b of BOWLS) for (const i of b.ingredients) expect(ITEMS[i.item], `${b.slug}: ${i.item}`).toBeDefined();
    for (const [k, it] of Object.entries(ITEMS)) {
      for (const p of it.parts ?? []) expect(ITEMS[p.item], `${k}: ${p.item}`).toBeDefined();
    }
  });

  it("a mix's shares add to one, so the grocery list neither gains nor loses grams", () => {
    for (const [k, it] of Object.entries(ITEMS)) {
      if (!it.parts) continue;
      const total = it.parts.reduce((n, p) => n + p.share, 0);
      expect(total, k).toBeCloseTo(1, 6);
    }
  });

  it("every activity has at least one mode", () => {
    for (const a of ACTIVITIES) expect(a.modes.length, a.slug).toBeGreaterThan(0);
  });
});

describe("groceryList", () => {
  it("adds a bowl's grams up by item, and expands mixes into parts", () => {
    const bowl = BOWLS[0];
    const list = groceryList({ [bowl.slug]: 2 });
    const total = list.reduce((n, l) => n + l.grams, 0);
    const expected = bowl.ingredients.reduce((n, i) => n + i.g * 2, 0);
    expect(total).toBeCloseTo(expected, 6);
    expect(list.some(l => ITEMS[l.item].parts)).toBe(false);
  });

  it("an item used by two bowls is one line", () => {
    const counts = Object.fromEntries(BOWLS.map(b => [b.slug, 1]));
    const list = groceryList(counts);
    expect(unique(list.map(l => l.item))).toBe(true);
  });

  it("is empty with nothing planned", () => {
    expect(groceryList({})).toEqual([]);
  });
});
