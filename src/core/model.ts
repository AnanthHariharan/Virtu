import { observedByDate } from "./rites";
import { featuresOf, type Ev } from "./account";
import { addDays, parseDate } from "./time";

/**
 * What the days predict.
 *
 * The one-table ledger was always meant to answer cross-module questions —
 * does training the day before move the sleep figure the morning after? —
 * and with Jev reading each evening's line, a day is now a row of numbers:
 * rites kept, sets and volume, minutes, pages, notes, last night's sleep,
 * and the energy, mood, stress and focus read in the reflection. This file
 * turns the ledger into that table and fits the smallest honest model to it.
 *
 * Honest means three things here:
 *
 *   - Time-ordered evaluation. The model is fitted on the earlier days and
 *     scored on the later ones it never saw, because that is the only
 *     question worth asking of it: would it have told you about tomorrow?
 *   - A baseline. Every score is set beside what "always predict the
 *     average" would have scored. A model that does not beat it has
 *     learned nothing, and says so.
 *   - Small and inspectable. Ridge and logistic regression on standardised
 *     features, fitted by plain gradient descent, so every coefficient
 *     reads as "one standard deviation of this moves the prediction by that".
 *
 * Pure: no browser, no database, no dependencies.
 */

export type Target = "sleep" | "rites";

export const TARGETS: Record<Target, { label: string; kind: "regression" | "binary"; unit?: string }> = {
  sleep: { label: "Sleep the night after", kind: "regression", unit: "h" },
  rites: { label: "Every rite kept the day after", kind: "binary" },
};

/** Days with a known outcome needed before a model is fitted at all. */
export const MIN_DAYS = 28;

export const FEATURES = [
  "rites", "sets", "volume", "active", "pages", "notes",
  "sleep_last", "weekend_next",
  "energy", "mood", "stress", "focus", "pain", "skipped",
] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  rites: "Rites kept", sets: "Sets", volume: "Volume (log)", active: "Active minutes",
  pages: "Pages read", notes: "Notes filed", sleep_last: "Last night's sleep",
  weekend_next: "Tomorrow is a weekend", energy: "Energy", mood: "Mood", stress: "Stress",
  focus: "Focus", pain: "Pain mentioned", skipped: "A practice skipped",
};

export interface DayRow { date: string; x: Record<Feature, number | null>; y: number | null }

/** date → the latest value of `metric` measured that day. */
function measuresByDate(events: Ev[], metric: string): Map<string, number> {
  const latest = new Map<string, Ev>();
  for (const e of events) {
    if (e.kind !== "measure" || e.payload?.metric !== metric) continue;
    const cur = latest.get(e.local_date);
    if (!cur || e.occurred_at > cur.occurred_at) latest.set(e.local_date, e);
  }
  return new Map([...latest].map(([d, e]) => [d, Number(e.payload.value)]));
}

/**
 * One row per day, features from that day only, target from the next. A
 * feature is null where the ledger says nothing — no reflection, no sleep
 * logged — and is imputed at fitting time, never invented here.
 */
export function days(events: Ev[], riteCount: number, target: Target, until?: string): DayRow[] {
  if (!events.length) return [];
  const by = new Map<string, Ev[]>();
  for (const e of events) {
    const xs = by.get(e.local_date);
    if (xs) xs.push(e); else by.set(e.local_date, [e]);
  }
  const sleep = measuresByDate(events, "sleep");
  const feats = featuresOf(events);
  const kept = observedByDate(events.filter(e => e.kind === "rite"));
  const firstRite = events.filter(e => e.kind === "rite").map(e => e.local_date).sort()[0];

  const dates = [...by.keys()].sort();
  const last = dates[dates.length - 1];
  // Through `until` (today) even if nothing is logged yet: an empty day is
  // still a day, and tomorrow's forecast is read from today's row.
  const end = until && until > last ? until : last;
  const rows: DayRow[] = [];
  for (let d = dates[0]; d <= end; d = addDays(d, 1)) {
    const today = by.get(d) ?? [];
    const of = (k: string) => today.filter(e => e.kind === k);
    const sum = (k: string, f: (p: any) => number) => of(k).reduce((n, e) => n + f(e.payload), 0);
    const line = of("reflection").filter(r => r.payload?.period === "day")
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
    const read = line ? feats.get(line.client_id) : undefined;
    const bool = (v: boolean | null | undefined) => v === true ? 1 : v === false ? 0 : null;
    const next = addDays(d, 1);
    const dow = parseDate(next).getDay();

    const x: Record<Feature, number | null> = {
      rites: riteCount ? (kept.get(d)?.size ?? 0) / riteCount : null,
      sets: of("set").length,
      volume: Math.log1p(sum("set", p => Number(p.weight) * Number(p.reps))),
      active: sum("activity", p => Number(p.minutes)),
      pages: sum("read", p => Math.max(0, Number(p.to) - Number(p.from))),
      notes: of("note").length,
      sleep_last: sleep.get(d) ?? null,
      weekend_next: dow === 0 || dow === 6 ? 1 : 0,
      energy: read?.energy ?? null, mood: read?.mood ?? null,
      stress: read?.stress ?? null, focus: read?.focus ?? null,
      pain: bool(read?.pain), skipped: bool(read?.skipped),
    };

    const y = target === "sleep"
      ? sleep.get(next) ?? null
      : riteCount && firstRite && next >= firstRite && next <= last
        ? ((kept.get(next)?.size ?? 0) >= riteCount ? 1 : 0)
        : null;
    rows.push({ date: d, x, y });
  }
  return rows;
}

/* ── fitting ───────────────────────────────────────────────────────── */

interface Scaler { mean: number; sd: number }

export interface Model {
  target: Target;
  features: Feature[];
  scalers: Record<string, Scaler>;
  weights: number[];
  bias: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Standardise each feature over the training rows; a null becomes the mean. */
function scalersFor(rows: DayRow[], features: Feature[]): Record<string, Scaler> {
  const out: Record<string, Scaler> = {};
  for (const f of features) {
    const xs = rows.map(r => r.x[f]).filter((v): v is number => v !== null);
    const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
    out[f] = { mean, sd };
  }
  return out;
}

function vector(r: DayRow, m: Pick<Model, "features" | "scalers">): number[] {
  return m.features.map(f => {
    const v = r.x[f];
    const s = m.scalers[f];
    return v === null || s.sd === 0 ? 0 : (v - s.mean) / s.sd;
  });
}

/** Ridge or logistic regression by batch gradient descent. Deterministic. */
export function fit(rows: DayRow[], target: Target, opts = { l2: 0.1, steps: 3000, rate: 0.05 }): Model {
  const labelled = rows.filter(r => r.y !== null);
  const scalers = scalersFor(labelled, [...FEATURES]);
  // A feature that never varies (never logged, or always the same) says nothing.
  const features = FEATURES.filter(f => scalers[f].sd > 0);
  const m: Model = { target, features, scalers, weights: features.map(() => 0), bias: 0 };
  const X = labelled.map(r => vector(r, m));
  const y = labelled.map(r => r.y as number);
  const n = X.length;
  const binary = TARGETS[target].kind === "binary";
  m.bias = binary ? 0 : y.reduce((a, b) => a + b, 0) / Math.max(n, 1);

  for (let step = 0; step < opts.steps && n > 0; step++) {
    const gw = m.weights.map(() => 0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = m.bias + X[i].reduce((s, v, j) => s + v * m.weights[j], 0);
      const err = (binary ? sigmoid(z) : z) - y[i];
      gb += err;
      for (let j = 0; j < gw.length; j++) gw[j] += err * X[i][j];
    }
    m.bias -= opts.rate * gb / n;
    for (let j = 0; j < gw.length; j++) m.weights[j] -= opts.rate * (gw[j] / n + opts.l2 * m.weights[j]);
  }
  return m;
}

export function predict(m: Model, r: DayRow): number {
  const z = m.bias + vector(r, m).reduce((s, v, j) => s + v * m.weights[j], 0);
  return TARGETS[m.target].kind === "binary" ? sigmoid(z) : z;
}

/* ── the honest question ───────────────────────────────────────────── */

export interface Report {
  target: Target;
  status: "insufficient" | "no-better" | "useful";
  /** Days with a known outcome. */
  labelled: number;
  train: number;
  test: number;
  /** MAE for sleep; Brier score for rites. Lower is better for both. */
  metric: "mae" | "brier";
  score: number | null;
  baseline: number | null;
  /** What moves the prediction, largest first: effect of one standard deviation. */
  drivers: { feature: Feature; label: string; effect: number }[];
  /** Tomorrow's prediction from today's row, when the model is worth reading. */
  tomorrow: number | null;
}

/**
 * Fit on the earlier 75% of labelled days, score on the rest, against the
 * baseline of always predicting the training average. Then refit on every
 * labelled day for the drivers and tomorrow's figure.
 */
export function forecast(events: Ev[], riteCount: number, target: Target, today: string): Report {
  const rows = days(events, riteCount, target, today);
  const labelled = rows.filter(r => r.y !== null);
  const metric = TARGETS[target].kind === "binary" ? "brier" : "mae";
  const empty: Report = {
    target, status: "insufficient", labelled: labelled.length, train: 0, test: 0,
    metric, score: null, baseline: null, drivers: [], tomorrow: null,
  };
  if (labelled.length < MIN_DAYS) return empty;

  const cut = Math.floor(labelled.length * 0.75);
  const train = labelled.slice(0, cut), test = labelled.slice(cut);
  const m = fit(train, target);
  const avg = train.reduce((s, r) => s + (r.y as number), 0) / train.length;
  const loss = (p: number, y: number) => metric === "mae" ? Math.abs(p - y) : (p - y) ** 2;
  const score = test.reduce((s, r) => s + loss(predict(m, r), r.y as number), 0) / test.length;
  const baseline = test.reduce((s, r) => s + loss(avg, r.y as number), 0) / test.length;

  const full = fit(labelled, target);
  const drivers = full.features
    .map((f, j) => ({ feature: f, label: FEATURE_LABELS[f], effect: full.weights[j] }))
    // An effect that rounds to nothing on screen is nothing.
    .filter(d => Math.abs(d.effect) >= 0.01)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  // Better than the baseline by a margin, or it has learned nothing worth showing.
  const useful = score < baseline * 0.95;
  const todayRow = rows.find(r => r.date === today);
  return {
    target, status: useful ? "useful" : "no-better", labelled: labelled.length,
    train: train.length, test: test.length, metric, score, baseline, drivers,
    tomorrow: useful && todayRow ? predict(full, todayRow) : null,
  };
}
