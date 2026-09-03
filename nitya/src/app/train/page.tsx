"use client";

import { Opening, Fleuron } from "@/components/Page";
import { useToday, useEntities } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { DOW, e1rm } from "@/lib/time";
import { haptic } from "@/lib/haptics";
import type { Entity } from "@/lib/types";

/** "4×5" → five sets of four… no: sets × reps. */
function parseScheme(s: string): { sets: number; reps: number } {
  const m = /^(\d+)\s*[×x]\s*(\d+|max)$/i.exec(s ?? "");
  if (!m) return { sets: 3, reps: 8 };
  return { sets: parseInt(m[1], 10), reps: m[2].toLowerCase() === "max" ? 0 : parseInt(m[2], 10) };
}

export default function Train() {
  const dow = new Date().getDay();
  const exercises = useEntities("exercise").filter(e =>
    Array.isArray(e.meta?.days) ? e.meta.days.includes(dow) : false
  );
  const today = useToday();

  const logged = today.filter(e => e.kind === "workout_set");
  const doneFor = (slug: string) => logged.filter(e => e.payload?.exercise_slug === slug).length;

  const volume = logged.reduce(
    (n, e) => n + Number(e.payload?.weight ?? 0) * Number(e.payload?.reps ?? 0), 0
  );

  async function logSet(ex: Entity, weight: number, reps: number) {
    haptic(1);
    await logEvent({
      kind: "workout_set",
      payload: { exercise_slug: ex.slug, exercise: ex.name, weight, reps },
    });
  }

  if (!exercises.length) {
    return (
      <>
        <Opening title="Rest " em="day" sub={`${DOW[dow]} · nothing scheduled`} />
        <Fleuron />
        <p className="note-it">
          No movements are set for {DOW[dow]}. Rest is an entry, not an absence — the
          ledger will record it as such once you enter it.
        </p>
      </>
    );
  }

  return (
    <>
      <Opening title="Train" em="ing" sub={`${DOW[dow]} · ${exercises.length} movements`} />
      <Fleuron />

      {exercises.map(ex => {
        const { sets, reps } = parseScheme(ex.meta?.scheme);
        const bw = !!ex.meta?.bodyweight;
        const bestW = Number(ex.state?.best_weight ?? 0);
        const bestR = Number(ex.state?.best_reps ?? 1);
        const record = e1rm(bestW, bestR);

        const mine = logged.filter(e => e.payload?.exercise_slug === ex.slug);
        const load = mine.reduce((n, e) => n + Number(e.payload?.weight ?? 0) * Number(e.payload?.reps ?? 0), 0);
        const todayBest = Math.max(0, ...mine.map(e => e1rm(Number(e.payload?.weight ?? 0), Number(e.payload?.reps ?? 0))));
        const onRecordPace = record > 0 && todayBest >= record;

        return (
          <div className="ex" key={ex.slug}>
            <div className="ex-h">
              <span className="ex-n">{ex.name}</span>
              {onRecordPace && <span className="pr-mark">record pace</span>}
            </div>

            <div className="sets">
              {Array.from({ length: Math.max(sets, mine.length) }, (_, i) => {
                const done = i < mine.length;
                const e = mine[i];
                const label = done
                  ? (Number(e.payload?.weight) > 0
                      ? `${e.payload?.weight} × ${e.payload?.reps}`
                      : `bw × ${e.payload?.reps}`)
                  : (bw ? `bw × ${reps || "max"}` : `${bestW || 0} × ${reps || "—"}`);
                return (
                  <button
                    key={i}
                    className={"set" + (done ? " done" : "")}
                    disabled={done}
                    onClick={() => {
                      const w = bw ? 0 : Number(prompt(`${ex.name} — weight in kg?`, String(bestW || 0)) ?? 0);
                      const r = Number(prompt("Reps?", String(reps || 8)) ?? 0);
                      if (r > 0) void logSet(ex, w, r);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                className="set add"
                onClick={() => {
                  const w = bw ? 0 : Number(prompt(`${ex.name} — weight in kg?`, String(bestW || 0)) ?? 0);
                  const r = Number(prompt("Reps?", String(reps || 8)) ?? 0);
                  if (r > 0) void logSet(ex, w, r);
                }}
              >
                +
              </button>
            </div>

            <div className="meta">
              <span>volume <b>{load.toLocaleString()} kg</b></span>
              <span>today&rsquo;s est. 1RM <b>{todayBest || "—"}{todayBest ? " kg" : ""}</b></span>
              <span>record <b>{bestW > 0 ? `${bestW} kg × ${bestR}` : "bodyweight"}</b></span>
              <span>done <b>{doneFor(ex.slug)} / {sets}</b></span>
            </div>
          </div>
        );
      })}

      <div className="total">
        <span>Daily load</span>
        <b>{volume.toLocaleString()} kg</b>
      </div>

      <p className="colophon">
        Volume load is Σ weight × reps. Estimated one-rep maximum by Epley:
        w × (1 + r ÷ 30), which holds to about six reps.
      </p>
    </>
  );
}
