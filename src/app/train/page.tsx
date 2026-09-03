"use client";

import { useMemo, useState } from "react";
import {
  Display, Section, Figures, Fig, Note, Sheet, Field,
  Stepper, Segmented, Empty, Spark,
} from "@/components/ui";
import { useDay, useEntities, useKind } from "@/hooks/useLedger";
import { log, patchState } from "@/lib/ledger";
import { PROGRAM, sessionFor, UNIT, repLabel, repTarget, type Movement } from "@/data/program";
import { DAYS, e1rm } from "@/lib/time";
import { tap } from "@/lib/haptics";
import type { VEvent } from "@/lib/types";

/**
 * Training.
 *
 * The one screen that has to work with cold hands, one thumb, and no
 * keyboard — so every number is entered with a stepper and every set is one
 * tap away from the last one. The previous version asked for weight and reps
 * through two `window.prompt()` dialogs, which is unusable between sets and
 * loses the whole entry if either is cancelled.
 */
export default function Train() {
  const dow = new Date().getDay();
  const scheduled = sessionFor(dow);
  const [active, setActive] = useState<string>(scheduled?.slug ?? PROGRAM[0].slug);
  const session = PROGRAM.find(s => s.slug === active) ?? PROGRAM[0];

  const exercises = useEntities("exercise");
  const day = useDay();
  const history = useKind("set");

  const [logging, setLogging] = useState<Movement | null>(null);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);

  const todaySets = useMemo(
    () => day.filter(e => e.kind === "set") as VEvent<"set">[], [day]
  );
  // Cardio is logged in minutes and carries no load, so it contributes
  // nothing here — which is correct, and why weight is the multiplier.
  const volume = todaySets.reduce(
    (n, e) => n + Number(e.payload?.weight ?? 0) * Number(e.payload?.reps ?? 0), 0
  );

  const entityFor = (slug: string) => exercises.find(e => e.slug === slug);
  const setsFor = (slug: string) => todaySets.filter(e => e.payload?.exercise === slug);

  /** The all-time best estimated 1RM, from the log rather than from a cache. */
  const bestFor = useMemo(() => {
    const m = new Map<string, { e1rm: number; weight: number; reps: number }>();
    for (const e of history) {
      const p = e.payload; if (!p) continue;
      const v = e1rm(p.weight, p.reps);
      const cur = m.get(p.exercise);
      if (!cur || v > cur.e1rm) m.set(p.exercise, { e1rm: v, weight: p.weight, reps: p.reps });
    }
    return m;
  }, [history]);

  /** Volume load per day over the last twelve sessions, for the sparkline. */
  const trend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of history) {
      const p = e.payload; if (!p) continue;
      byDate.set(e.local_date, (byDate.get(e.local_date) ?? 0) + p.weight * p.reps);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => v);
  }, [history]);

  function openLogger(m: Movement) {
    tap();
    const done = setsFor(m.slug);
    const last = done[0]?.payload;                     // most recent first
    const ent = entityFor(m.slug);
    setWeight(last ? last.weight : Number(ent?.state?.load ?? m.load ?? 0));
    setReps(last ? last.reps : repTarget(m.reps));
    setLogging(m);
  }

  async function save() {
    const m = logging;
    if (!m || reps <= 0) return;
    tap();
    await log("set", {
      exercise: m.slug, name: m.name,
      weight: m.bodyweight ? 0 : weight, reps,
      unit: UNIT, session: session.name,
    });
    // The working load is a cache of what the log already says; keeping it
    // current is what makes tomorrow's default correct.
    const ent = entityFor(m.slug);
    if (ent && !m.bodyweight) await patchState(ent.id, { load: weight });
    setLogging(null);
  }

  const sessionOptions = PROGRAM.map(s => ({ value: s.slug, label: s.name }));

  return (
    <>
      <Display
        deck={
          todaySets.length
            ? <><b>{todaySets.length} {todaySets.length === 1 ? "set" : "sets"}</b> at {volume.toLocaleString()} {UNIT} of volume load.</>
            : scheduled
              ? <><b>{scheduled.name}</b> is scheduled for {DAYS[dow]}. Nothing logged yet.</>
              : <>Nothing is scheduled for {DAYS[dow]}. Pick a session to run it anyway.</>
        }
      >
        Train<span className="thin">ing</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={todaySets.length} label="Sets" />
          <Fig value={volume ? volume.toLocaleString() : "0"} unit={UNIT} label="Volume" />
          <Fig value={session.movements.length} label="Movements" />
        </Figures>
      </div>

      <Section count={scheduled ? `${DAYS[dow].slice(0, 3)} · ${scheduled.name}` : DAYS[dow]}>
        Session
      </Section>
      <div style={{ marginTop: 14 }}>
        <Segmented value={active} onChange={setActive} options={sessionOptions} />
      </div>
      <p className="lede">{session.focus}</p>

      {session.movements.map(m => {
        const done = setsFor(m.slug);
        const ent = entityFor(m.slug);
        const load = Number(ent?.state?.load ?? m.load ?? 0);
        const best = bestFor.get(m.slug);
        const todayBest = Math.max(0, ...done.map(e => e1rm(e.payload!.weight, e.payload!.reps)));
        const isPr = !!best && todayBest >= best.e1rm && todayBest > 0;
        const load_ = done.reduce((n, e) => n + e.payload!.weight * e.payload!.reps, 0);

        return (
          <div className="move" key={m.slug}>
            <div className="move-h">
              <span className="nm">{m.name}</span>
              <span className="sc">
                {m.sets} × {m.time ? `${repLabel(m.reps)} min` : repLabel(m.reps)}
                {m.eachSide ? " each" : ""}
                {load ? ` · ${load}${m.perSide ? " × 2" : ""}` : m.bodyweight ? " · BW" : ""}
              </span>
            </div>

            <div className="sets">
              {Array.from({ length: Math.max(m.sets, done.length) }, (_, i) => {
                // done is newest-first; number the sets in the order performed
                const e = done[done.length - 1 - i];
                if (!e) {
                  return (
                    <button key={i} className="set" onClick={() => openLogger(m)}>
                      <span className="n">{m.time ? "Bout" : `Set ${i + 1}`}</span>
                      {m.time ? `${repLabel(m.reps)}′`
                        : m.bodyweight || !load ? repLabel(m.reps)
                        : `${load} · ${repLabel(m.reps)}`}
                    </button>
                  );
                }
                const p = e.payload!;
                const pr = !!best && e1rm(p.weight, p.reps) >= best.e1rm;
                return (
                  <div key={i} className={"set done" + (pr ? " pr" : "")}>
                    <span className="n">{m.time ? "Bout" : `Set ${i + 1}`}</span>
                    {m.time ? `${p.reps}′`
                      : p.weight > 0 ? `${p.weight} × ${p.reps}`
                      : `BW × ${p.reps}`}
                  </div>
                );
              })}
              <button className="set add" onClick={() => openLogger(m)} aria-label={`Log a set of ${m.name}`}>
                +
              </button>
            </div>

            <div className="move-m">
              {m.time ? (
                // Minutes are not load. Volume and a one-rep maximum say
                // nothing about twenty minutes on a rower.
                <span>Minutes <b>{done.reduce((n, e) => n + e.payload!.reps, 0) || "—"}</b></span>
              ) : (
                <>
                  <span>Volume <b>{load_.toLocaleString()} {UNIT}</b></span>
                  <span>Today <b>{todayBest || "—"}</b></span>
                  <span>Best <b>{best ? `${best.weight}${m.perSide ? "×2" : ""} × ${best.reps}` : "—"}</b></span>
                  {isPr && <span className="pr-flag">Record pace</span>}
                </>
              )}
            </div>
          </div>
        );
      })}

      {trend.length > 1 && (
        <>
          <Section count={`last ${trend.length}`}>Volume load</Section>
          <Spark points={trend} />
        </>
      )}

      {!todaySets.length && (
        <Empty title="No sets today.">
          Tap any set above to log it. The weight defaults to your last working
          load for that movement, so a set is usually two taps.
        </Empty>
      )}

      {/* ── the logger ── */}
      <Sheet title={logging?.name ?? ""} open={!!logging} onClose={() => setLogging(null)}>
        {logging && !logging.bodyweight && !logging.time && (
          <Field label={logging.perSide ? `Weight · ${UNIT} per hand` : `Weight · ${UNIT}`}>
            <Stepper value={weight} onChange={setWeight} step={2.5} min={0} max={500} unit={UNIT} />
          </Field>
        )}
        <Field label={
          logging?.time ? "Minutes"
          : logging?.eachSide ? "Repetitions — each side"
          : "Repetitions"
        }>
          <Stepper value={reps} onChange={setReps} step={1} min={0}
                   max={logging?.time ? 240 : 100} unit={logging?.time ? "min" : undefined} />
        </Field>

        {logging && (
          <p className="lede">
            {logging.sets} × {repLabel(logging.reps)}{logging.time ? " min" : ""}
            {logging.eachSide ? " each side" : ""}
            {logging.rest ? ` · ${logging.rest}s rest` : ""}
            {logging.note ? ` · ${logging.note}` : ""}
            {(() => {
              const b = bestFor.get(logging.slug);
              return b ? ` · best ${b.weight}${UNIT} × ${b.reps} (${b.e1rm} est.)` : "";
            })()}
          </p>
        )}

        <div className="btn-row">
          <button className="btn accent grow" onClick={save} disabled={reps <= 0}>Log set</button>
          <button className="btn quiet" onClick={() => setLogging(null)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Volume load is Σ&nbsp;weight&nbsp;×&nbsp;reps. The estimated one-rep
        maximum is Epley — <b>w × (1 + r ÷ 30)</b> — which holds to about six
        reps, which is where the working sets live. Records are computed from
        the log rather than stored, so correcting a set corrects the record.
        <br /><br />
        The split lives in <b>src/data/program.ts</b>. Edit it, bump its
        VERSION, and the next app open reseeds the movements without touching
        a single logged set.
      </Note>
    </>
  );
}
