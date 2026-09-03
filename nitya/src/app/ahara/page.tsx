"use client";

import { Opening, Fleuron } from "@/components/Page";
import { useToday, useEntities } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { DOW } from "@/lib/time";
import { haptic } from "@/lib/haptics";

const DISMISSALS = ["Eating out", "Travelling", "Fasting", "Unwell", "Skipped"];

export default function Ahara() {
  const slots = useEntities("meal_slot");
  const today = useToday();
  const dow = new Date().getDay();

  const statusOf = (slug: string) => {
    const e = today.find(x => x.kind === "meal" && x.payload?.meal_slug === slug);
    return e?.payload?.status as string | undefined;
  };

  async function record(slug: string, name: string, time: string, label: string, status: string) {
    haptic(1);
    await logEvent({ kind: "meal", payload: { meal_slug: slug, name, time, label, status } });
  }

  return (
    <>
      <Opening title="Āh" em="āra" sub={`${DOW[dow]} · the planned menu`} />
      <Fleuron />

      {slots.map(m => {
        const st = statusOf(m.slug);
        const ate = st === "ate";
        const time = String(m.meta?.time ?? "");
        const label = String(m.meta?.label ?? "");
        return (
          <div className={"meal" + (st && !ate ? " skip" : "")} key={m.slug}>
            <span className="m">
              {st && !ate ? `— ${st}` : m.name}
              <i>{time} · {label}</i>
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button
                className={"btn" + (ate ? " red" : "")}
                onClick={() => record(m.slug, m.name, time, label, ate ? "unset" : "ate")}
              >
                {ate ? "✓" : "Ate"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  const r = prompt(`Cause of dismissal?\n(${DISMISSALS.join(" · ")})`, DISMISSALS[0]);
                  if (r) void record(m.slug, m.name, time, label, r);
                }}
              >
                Skip
              </button>
            </span>
          </div>
        );
      })}

      <p className="note-it">
        Dismissal asks a reason, and the reason is the record. A blank skip tells you
        nothing in six months; &ldquo;travelling&rdquo; three Fridays running tells you a great deal.
      </p>
    </>
  );
}
