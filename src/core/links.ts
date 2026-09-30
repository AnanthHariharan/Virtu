import type { Answer } from "./schema";

/**
 * The commonplace book, cross-referenced.
 *
 * A learning is worth more beside the others it bears on. When a note is
 * filed, code shortlists the notes it most plausibly relates to — shared
 * rare words, scored like a small BM25, entirely on the device — and Jev is
 * asked one narrow Choice per candidate: does it support, contradict,
 * extend, or restate this note, or is it unrelated? Code keeps only the
 * confident, related answers as links. No embedding, no vector store, no
 * graph database: the shortlist narrows, the model judges, the ledger keeps
 * the judgment, and the links are folded from it on read.
 *
 * Pure: no browser, no database, no network.
 */

const STOP = new Set(("the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into is it of to in a an be on at by as or if so no do my me we he").split(" "));

export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z]{3,}/g) ?? [])
    .filter(w => !STOP.has(w));
}

export interface Doc { id: string; text: string }

/**
 * The notes most likely to bear on `doc`, best first. Scored by shared
 * words weighted by rarity across the book, so "ornament" counts for more
 * than "practice". Only candidates sharing at least one word are returned.
 */
export function shortlist(doc: Doc, corpus: Doc[], k = 8): Doc[] {
  const others = corpus.filter(d => d.id !== doc.id);
  if (!others.length) return [];
  const df = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  for (const d of [doc, ...others]) {
    const s = new Set(tokens(d.text));
    sets.set(d.id, s);
    for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const N = others.length + 1;
  const idf = (w: string) => Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
  const mine = sets.get(doc.id)!;
  return others
    .map(d => {
      const theirs = sets.get(d.id)!;
      let score = 0;
      for (const w of mine) if (theirs.has(w)) score += idf(w);
      return { d, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
    .slice(0, k)
    .map(x => x.d);
}

export const RELATIONS = {
  supports: { what: "Gives a reason, example or evidence for `note`", not_for: "Merely on the same topic" },
  contradicts: { what: "Says something that cannot be true at once with `note`", not_for: "A different emphasis" },
  extends: { what: "Carries `note` further: an application, a consequence, a refinement", not_for: "Saying the same thing" },
  same: { what: "Says essentially what `note` says, in other words", not_for: "A related but distinct point" },
  unrelated: { what: "Shares words with `note` but not its point", not_for: "Anything with a real bearing on it" },
} as const;

export type Relation = keyof typeof RELATIONS;

/** One request: the note, its candidates, and one Choice per candidate. */
export function linkRequest(note: string, candidates: Doc[]) {
  const state = { note, candidates: Object.fromEntries(candidates.map((c, i) => [`c${i}`, c.text])) };
  const questions: Record<string, { type: "choice"; instructions: string; criteria: typeof RELATIONS }> = {};
  candidates.forEach((c, i) => {
    // The id is for code; the model sees only the instruction.
    questions[`rel:${c.id}`] = {
      type: "choice",
      instructions: `How does \`candidates.c${i}\` bear on \`note\`?`,
      criteria: RELATIONS,
    };
  });
  return { state, questions };
}

export const LINK_GATE = 0.6;

export interface Link { from: string; to: string; relation: Exclude<Relation, "unrelated">; confidence: number }

interface J { payload: { target: string; task: string; answers: Record<string, Answer> } | null; recorded_at: string }

/** Links, folded from the latest link judgment for each note. */
export function linksFrom(judgments: J[], gate = LINK_GATE): Link[] {
  const latest = new Map<string, J>();
  for (const j of judgments) {
    if (j.payload?.task !== "link") continue;
    const cur = latest.get(j.payload.target);
    if (!cur || j.recorded_at > cur.recorded_at) latest.set(j.payload.target, j);
  }
  const out: Link[] = [];
  for (const j of latest.values()) {
    for (const [id, a] of Object.entries(j.payload!.answers)) {
      if (!id.startsWith("rel:") || a.type !== "choice") continue;
      if (a.choice === "unrelated" || !(a.choice in RELATIONS) || a.confidence < gate) continue;
      out.push({ from: j.payload!.target, to: id.slice(4), relation: a.choice as Link["relation"], confidence: a.confidence });
    }
  }
  return out;
}

/** How a link reads from the other end. */
export const INVERSE: Record<Link["relation"], string> = {
  supports: "supported by", contradicts: "contradicts", extends: "extended by", same: "same as",
};

/** For each note, what it links to and what links to it, readable from either end. */
export function neighbours(links: Link[]): Map<string, { id: string; reads: string; confidence: number }[]> {
  const m = new Map<string, { id: string; reads: string; confidence: number }[]>();
  const add = (k: string, v: { id: string; reads: string; confidence: number }) => {
    const xs = m.get(k) ?? [];
    if (!xs.some(x => x.id === v.id)) xs.push(v);
    m.set(k, xs);
  };
  for (const l of links) {
    add(l.from, { id: l.to, reads: l.relation, confidence: l.confidence });
    add(l.to, { id: l.from, reads: INVERSE[l.relation], confidence: l.confidence });
  }
  for (const xs of m.values()) xs.sort((a, b) => b.confidence - a.confidence);
  return m;
}
