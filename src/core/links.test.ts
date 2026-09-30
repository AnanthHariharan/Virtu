import { describe, expect, it } from "vitest";
import { tokens, shortlist, linkRequest, linksFrom, neighbours, LINK_GATE, RELATIONS } from "./links";
import type { Answer } from "./schema";

const choice = (c: string, confidence = 0.9): Answer => ({ type: "choice", choice: c, confidence, probabilities: { [c]: confidence } });
const judgment = (target: string, answers: Record<string, Answer>, recorded_at = "2026-09-30T10:00:00Z") =>
  ({ recorded_at, payload: { target, task: "link", answers } });

describe("tokens", () => {
  it("folds diacritics and drops short and common words", () => {
    expect(tokens("The Vedānta of the Upaniṣads is an ornament")).toEqual(["vedanta", "upanisads", "ornament"]);
  });
});

describe("shortlist", () => {
  const book = [
    { id: "a", text: "Structure is the ornament of a page" },
    { id: "b", text: "Ornament hides a weak structure" },
    { id: "c", text: "Practice every day, practice daily" },
    { id: "d", text: "A page of practice" },
  ];

  it("ranks by shared rare words, and leaves out what shares none", () => {
    const s = shortlist(book[0], book).map(d => d.id);
    expect(s[0]).toBe("b");
    expect(s).toContain("d");
    expect(s).not.toContain("c");
    expect(s).not.toContain("a");
  });

  it("is empty for a book of one, and respects k", () => {
    expect(shortlist(book[0], [book[0]])).toEqual([]);
    expect(shortlist(book[0], book, 1)).toHaveLength(1);
  });
});

describe("linkRequest", () => {
  it("asks one Choice per candidate, keyed by id, pointing at its place in state", () => {
    const { state, questions } = linkRequest("n", [{ id: "x1", text: "one" }, { id: "x2", text: "two" }]);
    expect(state).toEqual({ note: "n", candidates: { c0: "one", c1: "two" } });
    expect(Object.keys(questions)).toEqual(["rel:x1", "rel:x2"]);
    expect(questions["rel:x2"].instructions).toContain("candidates.c1");
    expect(Object.keys(questions["rel:x1"].criteria)).toEqual(Object.keys(RELATIONS));
  });
});

describe("linksFrom and neighbours", () => {
  it("keeps confident, related answers from the latest judgment per note", () => {
    const links = linksFrom([
      judgment("n1", { "rel:a": choice("unrelated") }, "2026-09-30T09:00:00Z"),
      judgment("n1", { "rel:a": choice("extends"), "rel:b": choice("supports", LINK_GATE - 0.1), "rel:c": choice("unrelated") }),
      { recorded_at: "x", payload: { target: "n2", task: "triage", answers: { "rel:z": choice("same") } } },
    ]);
    expect(links).toEqual([{ from: "n1", to: "a", relation: "extends", confidence: 0.9 }]);
  });

  it("reads a link from both ends", () => {
    const m = neighbours([{ from: "n1", to: "a", relation: "extends", confidence: 0.9 }]);
    expect(m.get("n1")).toEqual([{ id: "a", reads: "extends", confidence: 0.9 }]);
    expect(m.get("a")).toEqual([{ id: "n1", reads: "extended by", confidence: 0.9 }]);
  });
});
