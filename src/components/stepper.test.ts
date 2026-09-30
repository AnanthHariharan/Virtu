import { describe, expect, it } from "vitest";
import { stepClamp } from "./ui";

describe("stepClamp", () => {
  it("keeps the half of a 2.5 step", () => {
    expect(stepClamp(175 + 2.5, 2.5, 0, 500)).toBe(177.5);
  });

  it("rounds away float noise at the step's precision", () => {
    expect(stepClamp(0.1 + 0.2, 0.1, 0, 10)).toBe(0.3);
    expect(stepClamp(7.5 + 0.25, 0.25, 0, 24)).toBe(7.75);
  });

  it("whole steps stay whole", () => {
    expect(stepClamp(10.4, 1, 0, 100)).toBe(10);
  });

  it("clamps to the range", () => {
    expect(stepClamp(-2.5, 2.5, 0, 500)).toBe(0);
    expect(stepClamp(502.5, 2.5, 0, 500)).toBe(500);
  });
});
