import { describe, expect, it } from "vitest";
import { unfiledCaptures } from "./commonplace";
import { ev, SAMPLES } from "@/test/fixtures";

describe("unfiledCaptures", () => {
  it("a capture with no note is unfiled", () => {
    const c = ev("capture", { text: "a thought" });
    expect(unfiledCaptures([c], [])).toEqual([c]);
  });

  it("a note naming the capture files it, even reworded", () => {
    const c = ev("capture", { text: "a thougt, badly typed" });
    const n = ev("note", { ...SAMPLES.note, text: "A thought, well typed.", files: c.client_id });
    expect(unfiledCaptures([c], [n])).toEqual([]);
  });

  it("a legacy note with identical text still files it", () => {
    const c = ev("capture", { text: "  same words " });
    const n = ev("note", { ...SAMPLES.note, text: "same words" });
    expect(unfiledCaptures([c], [n])).toEqual([]);
  });

  it("filing one capture leaves the others in the inbox", () => {
    const a = ev("capture", { text: "one" });
    const b = ev("capture", { text: "two" });
    const n = ev("note", { ...SAMPLES.note, text: "uno", files: a.client_id });
    expect(unfiledCaptures([a, b], [n])).toEqual([b]);
  });

  it("an empty capture never appears, and raw text stands in for a payload", () => {
    const empty = ev("capture", { text: "   " });
    const rawOnly = ev("capture", null, { raw: "from raw" });
    expect(unfiledCaptures([empty, rawOnly], [])).toEqual([rawOnly]);
  });
});
