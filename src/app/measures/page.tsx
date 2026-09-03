"use client";

import { useMemo, useState } from "react";
import { Display, Section, Note, Sheet, Field, Stepper, Spark, Empty } from "@/components/ui";
import { useEntities, useKind } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { localDate } from "@/lib/time";
import { tap } from "@/lib/haptics";
import type { Entity } from "@/lib/types";

/**
 * Measures.
 *
 * The small number of figures that the rest of the ledger moves — weight,
 * sleep, resting pulse. One value a day is plenty; the trend is the point,
 * not the reading.
 */
export default function Measures() {
  const metrics = useEntities("metric");
  const events = useKind("measure");
  const [logging, setLogging] = useState<Entity | null>(null);
  const [value, setValue] = useState(0);

  const series = useMemo(() => {
    const m = new Map<string, { date: string; value: number }[]>();
    // newest first from the ledger; reverse into chronological order
    for (const e of [...events].reverse()) {
      const p = e.payload; if (!p) continue;
      const list = m.get(p.metric) ?? [];
      list.push({ date: e.local_date, value: p.value });
      m.set(p.metric, list);
    }
    return m;
  }, [events]);

  function open(m: Entity) {
    tap();
    const last = series.get(m.slug)?.slice(-1)[0];
    setValue(last?.value ?? Number(m.meta?.start ?? 0));
    setLogging(m);
  }

  async function save() {
    if (!logging) return;
    tap();
    await log("measure", {
      metric: logging.slug, name: logging.name,
      value, unit: String(logging.meta?.unit ?? ""),
    });
    setLogging(null);
  }

  return (
    <>
      <Display deck={<>The figures the rest of the ledger moves. One reading a day is plenty; the direction is the point.</>}>
        Meas<span className="thin">ures</span>
      </Display>

      {metrics.map(m => {
        const list = series.get(m.slug) ?? [];
        const last = list.slice(-1)[0];
        const prev = list.slice(-2)[0];
        const delta = last && prev ? last.value - prev.value : 0;
        const good = m.meta?.down ? delta < 0 : delta > 0;
        const today = last?.date === localDate();
        const points = list.slice(-14).map(p => p.value);

        return (
          <div key={m.slug}>
            <Section
              count={last
                ? `${delta === 0 ? "—" : (delta > 0 ? "+" : "") + delta.toFixed(m.meta?.step < 1 ? 1 : 0)}`
                : "no readings"}
            >
              {m.name}
            </Section>
            <button className="row" onClick={() => open(m)}>
              <span className={"mk" + (today ? "" : " on")} aria-hidden="true">{today ? "●" : "○"}</span>
              <span className="bd">
                <span className="t">{last ? `${last.value} ${m.meta?.unit}` : "Not yet recorded"}</span>
                <span className="m">
                  {last
                    ? `${today ? "Today" : last.date}${prev ? ` · ${good ? "improving" : "drifting"}` : ""}`
                    : "Tap to enter the first reading"}
                </span>
              </span>
              <span className="v">{list.length} pts</span>
            </button>
            {points.length > 1 && <Spark points={points} />}
          </div>
        );
      })}

      {!metrics.length && (
        <Empty title="No measures kept.">
          Add them to <b>src/data/heads.ts</b> under METRICS and bump the VERSION.
        </Empty>
      )}

      <Sheet title={logging?.name ?? ""} open={!!logging} onClose={() => setLogging(null)}>
        <Field label={`Reading · ${logging?.meta?.unit ?? ""}`}>
          <Stepper value={value} onChange={setValue}
                   step={Number(logging?.meta?.step ?? 1)} min={0} max={999}
                   unit={String(logging?.meta?.unit ?? "")} />
        </Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={save}>Record</button>
          <button className="btn quiet" onClick={() => setLogging(null)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Readings are events like everything else, so a second reading on the
        same day does not overwrite the first — it sits after it. The
        sparkline shows the last fourteen.
      </Note>
    </>
  );
}
