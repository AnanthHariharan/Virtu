"use client";

import { useMemo, useState } from "react";
import { Display, Section, Figures, Fig, Note, Sheet, Field, Text, Chips } from "@/components/ui";
import { useDay, useEntities, useAll } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { DISMISSALS } from "@/data/menu";
import { longDate, streak } from "@/lib/time";
import { tap } from "@/lib/haptics";
import type { Entity, VEvent } from "@/lib/types";

/**
 * Meals.
 *
 * A meal is a plan; confirming it is the entry. Dismissal asks for a cause,
 * and the cause is the whole point: a blank skip tells you nothing in six
 * months, while "travelling" three Fridays running tells you a great deal.
 */
export default function Meals() {
  const meals = useEntities("meal");
  const day = useDay();
  const all = useAll();
  const [dismissing, setDismissing] = useState<Entity | null>(null);
  const [cause, setCause] = useState<string>(DISMISSALS[0]);
  const [other, setOther] = useState("");

  const today = useMemo(
    () => day.filter(e => e.kind === "meal") as VEvent<"meal">[], [day]
  );

  /** Latest event per meal wins; earlier ones stay in the log as history. */
  const statusOf = (slug: string) => today.find(e => e.payload?.slug === slug)?.payload?.status;

  const eaten = meals.filter(m => statusOf(m.slug) === "ate").length;
  const dismissed = meals.filter(m => {
    const s = statusOf(m.slug);
    return s && s !== "ate" && s !== "unset";
  }).length;

  const adherence = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of all) {
      if (e.kind !== "meal" || (e.payload as any)?.status !== "ate") continue;
      byDate.set(e.local_date, (byDate.get(e.local_date) ?? 0) + 1);
    }
    return streak(d => (byDate.get(d) ?? 0) >= Math.max(1, meals.length - 1));
  }, [all, meals.length]);

  async function record(m: Entity, status: string, note?: string) {
    tap();
    await log("meal", {
      slug: m.slug, name: m.name, slot: String(m.meta?.label ?? ""), status, note,
    });
  }

  async function confirmDismissal() {
    if (!dismissing) return;
    const c = cause === "Other" ? (other.trim() || "Other") : cause;
    await record(dismissing, c, other.trim() || undefined);
    setDismissing(null);
    setOther("");
    setCause(DISMISSALS[0]);
  }

  return (
    <>
      <Display deck={<>{longDate()}. <b>{eaten} of {meals.length}</b> taken{dismissed ? `, ${dismissed} dismissed` : ""}.</>}>
        Meals
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={`${eaten}/${meals.length}`} label="Taken" />
          <Fig value={dismissed} label="Dismissed" hot={dismissed > 1} />
          <Fig value={adherence} unit="d" label="Streak" />
        </Figures>
      </div>

      <Section count={`${meals.length} planned`}>Table</Section>

      {meals.map(m => {
        const st = statusOf(m.slug);
        const ate = st === "ate";
        const skipped = !!st && st !== "ate" && st !== "unset";
        const items = (m.meta?.items ?? []) as string[];
        return (
          <div className="row" key={m.slug} style={{ gridTemplateColumns: "44px 1fr auto" }}>
            <span className="mk num" aria-hidden="true">{String(m.meta?.time ?? "")}</span>
            <span className="bd">
              <span className="t" style={ate ? { textDecoration: "line-through", color: "var(--ink-3)" } : undefined}>
                {m.name}
              </span>
              <span className="m">
                {skipped ? `Dismissed — ${st}` : (items.length ? items.join(" · ") : String(m.meta?.label ?? ""))}
              </span>
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button className={"btn sm" + (ate ? " fill" : " quiet")}
                      onClick={() => record(m, ate ? "unset" : "ate")}>
                {ate ? "Taken" : "Ate"}
              </button>
              <button className="btn sm quiet"
                      onClick={() => { tap(); setDismissing(m); }}>
                Skip
              </button>
            </span>
          </div>
        );
      })}

      <Sheet title={`Dismiss — ${dismissing?.name ?? ""}`} open={!!dismissing}
             onClose={() => setDismissing(null)}>
        <span className="label">Cause</span>
        <Chips value={cause} onChange={setCause}
               options={DISMISSALS.map(d => ({ value: d, label: d }))} />
        {cause === "Other" && (
          <Field label="In your own words">
            <Text value={other} onChange={setOther} placeholder="Why not?" autoFocus />
          </Field>
        )}
        <div className="btn-row">
          <button className="btn accent grow" onClick={confirmDismissal}>Record</button>
          <button className="btn quiet" onClick={() => setDismissing(null)}>Cancel</button>
        </div>
        <p className="foot-note">
          The cause is the record. Dismissals with reasons are the only thing
          in this module that will still be useful a year from now.
        </p>
      </Sheet>

      <Note>
        The menu lives in <b>src/data/menu.ts</b>. Edit it, bump its VERSION,
        and the next app open reseeds it — every meal you have already
        recorded stays exactly where it is.
      </Note>
    </>
  );
}
