import { observedByDate } from "./rites";
import { unfiledCaptures } from "./commonplace";
import { acceptedTargets } from "./inbox";
import { reflectionFeatures, type Features } from "./reflection";
import { addDays, streak, SLOTS } from "./time";
import type { Answer } from "./schema";

/**
 * Accountability, as arithmetic.
 *
 * Every thread below is a FACT computed from the ledger — a rite outstanding,
 * a project untouched for three weeks, a lapse in training — and none of it
 * is a model's opinion. Each has an urgency (how far past its line it is,
 * 0..2) and a weight (how much that kind of thread matters to you), and the
 * composite score is their product. The weights are in `WEIGHTS`, in code,
 * shown beside every thread: when the ranking disagrees with you, change a
 * number here rather than rewording a prompt.
 *
 * The one place a model contributes is a reflection's features — a mention
 * of pain — and even that only raises a thread; it never writes anything.
 *
 * Pure: no browser, no database.
 */

export interface Ev {
  client_id: string;
  kind: string;
  local_date: string;
  occurred_at: string;
  recorded_at: string;
  raw: string | null;
  payload: any;
}

export interface AccountInput {
  today: string;
  slot: (typeof SLOTS)[number]["key"];
  /** Every standing event, corrections resolved. */
  events: Ev[];
  rites: { slug: string; name: string; slot: string }[];
  /** The session scheduled for today, if any. */
  session: { name: string } | null;
  books: { slug: string; name: string }[];
  metrics: { slug: string; name: string }[];
}

export type ThreadType =
  | "rites" | "streak" | "session" | "lapse" | "project"
  | "captures" | "book" | "metric" | "pain" | "reflect";

export const WEIGHTS: Record<ThreadType, number> = {
  pain: 1.5,        // the body first
  streak: 1.3,      // a long run is expensive to lose
  rites: 1.2,
  session: 0.9,
  lapse: 0.8,
  project: 0.7,
  reflect: 0.5,
  captures: 0.5,
  metric: 0.4,
  book: 0.3,
};

/** How long each kind of thing may rest before it is a thread at all, in days. */
export const LINES = { lapse: 4, project: 10, captures: 3, book: 14, metric: 7, pain: 2 };

export interface Thread {
  id: string;
  type: ThreadType;
  title: string;
  detail: string;
  href: string;
  urgency: number;
  weight: number;
  score: number;
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
const cap = (x: number) => Math.max(0, Math.min(2, x));

function thread(type: ThreadType, id: string, title: string, detail: string, href: string, urgency: number): Thread {
  const u = Number(cap(urgency).toFixed(2));
  return { id: `${type}:${id}`, type, title, detail, href, urgency: u, weight: WEIGHTS[type], score: Number((u * WEIGHTS[type]).toFixed(3)) };
}

/** The latest local_date on which an event matching `f` happened. */
function lastDate(events: Ev[], f: (e: Ev) => boolean): string | null {
  let best: string | null = null;
  for (const e of events) if (f(e) && (!best || e.local_date > best)) best = e.local_date;
  return best;
}

/** A reflection's features, from its latest reflection judgment. */
export function featuresOf(events: Ev[]): Map<string, Features> {
  const latest = new Map<string, Ev>();
  for (const e of events) {
    if (e.kind !== "judgment" || e.payload?.task !== "reflection") continue;
    const cur = latest.get(e.payload.target);
    if (!cur || e.recorded_at > cur.recorded_at) latest.set(e.payload.target, e);
  }
  const out = new Map<string, Features>();
  for (const [target, j] of latest) out.set(target, reflectionFeatures(j.payload.answers as Record<string, Answer>));
  return out;
}

export function threads(input: AccountInput): Thread[] {
  const { today, slot, events, rites } = input;
  const out: Thread[] = [];
  const slotIndex = SLOTS.findIndex(s => s.key === slot);
  const late = slot === "evening" || slot === "night";
  const ofKind = (k: string) => events.filter(e => e.kind === k);

  /* rites whose part of the day has passed */
  const byDate = observedByDate(ofKind("rite"));
  const done = byDate.get(today) ?? new Set<string>();
  const outstanding = rites.filter(r => {
    const i = SLOTS.findIndex(s => s.key === r.slot);
    return i > -1 && i < slotIndex && !done.has(r.slug);
  });
  if (outstanding.length) {
    out.push(thread("rites", today, `${outstanding.length} ${outstanding.length === 1 ? "rite" : "rites"} outstanding`,
      outstanding.map(r => r.name).join(" · "), "/anushtanas", 2 * outstanding.length / Math.max(1, rites.length)));
  }

  /* a run of full days about to break */
  if (rites.length && late) {
    const full = (d: string) => (byDate.get(d)?.size ?? 0) >= rites.length;
    const run = streak(full, addDays(today, -1));
    if (run >= 3 && !full(today)) {
      out.push(thread("streak", today, `A ${run}-day run ends tonight`,
        `${rites.length - done.size} of ${rites.length} rites still open`, "/anushtanas", 1 + Math.min(run, 30) / 30));
    }
  }

  /* the day's session, unopened by evening */
  const moved = (d: string) => events.some(e => (e.kind === "set" || e.kind === "activity") && e.local_date === d);
  if (input.session && late && !moved(today)) {
    out.push(thread("session", today, `${input.session.name} is unopened`, "Scheduled for today", "/train", slot === "night" ? 1.5 : 1));
  }

  /* no movement at all for a while */
  const lastMove = lastDate(events, e => e.kind === "set" || e.kind === "activity");
  if (lastMove) {
    const gap = days(lastMove, today);
    if (gap >= LINES.lapse) {
      out.push(thread("lapse", "body", `${gap} days without training`, `Last on ${lastMove}`, "/train", gap / (LINES.lapse * 2)));
    }
  }

  /* projects with open steps and no movement */
  const stepState = new Map<string, { done: boolean; at: string; date: string }>();
  for (const e of ofKind("task")) {
    const key = `${e.payload.project}\u0000${e.payload.step}`;
    const cur = stepState.get(key);
    const at = `${e.occurred_at}|${e.recorded_at}`;
    if (!cur || at > cur.at) stepState.set(key, { done: !!e.payload.done, at, date: e.local_date });
  }
  const projects = new Map<string, { open: number; last: string }>();
  for (const [key, s] of stepState) {
    const name = key.split("\u0000")[0];
    const p = projects.get(name) ?? { open: 0, last: "0000-00-00" };
    if (!s.done) p.open++;
    if (s.date > p.last) p.last = s.date;
    projects.set(name, p);
  }
  for (const [name, p] of projects) {
    const gap = days(p.last, today);
    if (p.open && gap >= LINES.project) {
      out.push(thread("project", name, `${name} has stalled`, `${p.open} open, untouched for ${gap} days`, "/work", gap / (LINES.project * 2)));
    }
  }

  /* captures waiting to be filed */
  const waiting = unfiledCaptures(ofKind("capture"), ofKind("note"), acceptedTargets(ofKind("verdict")))
    .filter(c => days(c.local_date, today) >= LINES.captures);
  if (waiting.length) {
    out.push(thread("captures", "inbox", `${waiting.length} ${waiting.length === 1 ? "capture" : "captures"} unfiled`,
      `Waiting ${LINES.captures}+ days`, "/commonplace", waiting.length / 5));
  }

  /* books set down */
  for (const b of input.books) {
    const last = lastDate(events, e => e.kind === "read" && e.payload?.book === b.slug);
    if (!last) continue;
    const gap = days(last, today);
    if (gap >= LINES.book) out.push(thread("book", b.slug, `${b.name} set down`, `Last read ${gap} days ago`, `/read/${b.slug}`, gap / (LINES.book * 2)));
  }

  /* measures kept, then not */
  for (const m of input.metrics) {
    const last = lastDate(events, e => e.kind === "measure" && e.payload?.metric === m.slug);
    if (!last) continue;               // never kept: not a lapse, a choice
    const gap = days(last, today);
    if (gap >= LINES.metric) out.push(thread("metric", m.slug, `${m.name} not measured`, `Last on ${last}`, "/measures", gap / (LINES.metric * 2)));
  }

  /* pain noted in a recent reflection */
  const features = featuresOf(events);
  const painful = ofKind("reflection")
    .filter(r => features.get(r.client_id)?.pain === true && days(r.local_date, today) <= LINES.pain)
    .sort((a, b) => b.local_date.localeCompare(a.local_date))[0];
  if (painful) {
    out.push(thread("pain", painful.local_date, "Pain noted",
      input.session ? `On ${painful.local_date} — weigh it before ${input.session.name}` : `On ${painful.local_date}`,
      "/review", 2 - days(painful.local_date, today) / LINES.pain));
  }

  /* the evening line, unwritten */
  if (late && !ofKind("reflection").some(r => r.local_date === today && r.payload?.period === "day")) {
    out.push(thread("reflect", today, "Tonight's line is unwritten", "A few words on the day", "/review", slot === "night" ? 1.5 : 1));
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/* ── the week ─────────────────────────────────────────────────────── */

export interface WeekLine { label: string; unit?: string; now: number | null; prev: number | null; down?: boolean }

/** Seven days ending `today`, against the seven before. Every figure is a count or a sum. */
export function week(events: Ev[], today: string, riteCount: number, loadUnit = "lb"): WeekLine[] {
  const start = addDays(today, -6), prevStart = addDays(today, -13), prevEnd = addDays(today, -7);
  const inNow = (d: string) => d >= start && d <= today;
  const inPrev = (d: string) => d >= prevStart && d <= prevEnd;
  const features = featuresOf(events);

  const both = (f: (inRange: (d: string) => boolean) => number | null) => ({ now: f(inNow), prev: f(inPrev) });
  const sum = (kind: string, v: (p: any) => number) => (r: (d: string) => boolean) =>
    events.filter(e => e.kind === kind && r(e.local_date)).reduce((n, e) => n + v(e.payload), 0);
  const avg = (key: "energy" | "mood" | "stress") => (r: (d: string) => boolean) => {
    const xs = events.filter(e => e.kind === "reflection" && r(e.local_date))
      .map(e => features.get(e.client_id)?.[key]).filter((x): x is number => typeof x === "number");
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) : null;
  };
  const byDate = observedByDate(events.filter(e => e.kind === "rite"));
  const fullDays = (r: (d: string) => boolean) =>
    riteCount ? [...byDate.entries()].filter(([d, s]) => r(d) && s.size >= riteCount).length : 0;

  return [
    { label: "Days all rites kept", ...both(fullDays) },
    { label: "Sets", ...both(sum("set", () => 1)) },
    { label: "Volume", unit: loadUnit, ...both(sum("set", p => Number(p.weight) * Number(p.reps))) },
    { label: "Active", unit: "min", ...both(sum("activity", p => Number(p.minutes))) },
    { label: "Pages", ...both(sum("read", p => Math.max(0, Number(p.to) - Number(p.from)))) },
    { label: "Notes", ...both(sum("note", () => 1)) },
    { label: "Steps struck", ...both(sum("task", p => (p.done ? 1 : 0))) },
    { label: "Lines written", ...both(sum("reflection", () => 1)) },
    { label: "Energy", unit: "%", ...both(avg("energy")) },
    { label: "Mood", unit: "%", ...both(avg("mood")) },
    { label: "Stress", unit: "%", down: true, ...both(avg("stress")) },
  ];
}
