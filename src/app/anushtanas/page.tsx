"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Display, Section, Row, Figures, Fig, Note } from "@/components/ui";
import { useDay, useEntities, useAll, useKind } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { SLOTS, slotFor, streak, localDate } from "@/lib/time";
import { tap } from "@/lib/haptics";
import type { Slot } from "@/lib/types";

export default function Anushtanas() {
  const router = useRouter();
  const rites = useEntities("rite");
  const day = useDay();
  const all = useAll();
  const japa = useKind("japa");
  const slot = slotFor();

  const observed = useMemo(() => new Set(
    day.filter(e => e.kind === "rite" && (e.payload as any)?.observed)
       .map(e => String((e.payload as any).slug))
  ), [day]);

  /**
   * Marking a rite writes an event. Un-marking writes another event with
   * `observed: false` — the log is append-only, so nothing is ever deleted
   * and the record shows that you changed your mind, which is itself data.
   */
  async function mark(slug: string, name: string, riteSlot: Slot, japaRite: boolean) {
    const now = !observed.has(slug);
    tap(now ? 1 : 2);
    await log("rite", { slug, name, slot: riteSlot, observed: now });
    if (japaRite && now) router.push("/anushtanas/japa");
  }

  const done = observed.size;
  const malasToday = japa.filter(e => e.local_date === localDate()).length;

  const adherence = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const e of all) {
      if (e.kind !== "rite" || !(e.payload as any)?.observed) continue;
      const s = byDate.get(e.local_date) ?? new Set();
      s.add(String((e.payload as any).slug));
      byDate.set(e.local_date, s);
    }
    const full = (d: string) => (byDate.get(d)?.size ?? 0) >= rites.length && rites.length > 0;
    const last30 = [...byDate.entries()].slice(-30);
    return {
      streak: streak(full),
      days: last30.filter(([d]) => full(d)).length,
      seen: last30.length,
    };
  }, [all, rites.length]);

  return (
    <>
      <Display deck={<>Nitya-karma, through the parts of the day. <b>{done} of {rites.length}</b> observed.</>}>
        Anu<span className="thin">ṣṭhānas</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={`${done}/${rites.length}`} label="Today" />
          <Fig value={adherence.streak} unit="d" label="Unbroken" hot={adherence.streak >= 7} />
          <Fig value={malasToday} label="Mālās" />
        </Figures>
      </div>

      {SLOTS.map(s => {
        const mine = rites.filter(r => r.meta?.slot === s.key);
        if (!mine.length) return null;
        const n = mine.filter(r => observed.has(r.slug)).length;
        return (
          <div key={s.key}>
            <Section count={`${n}/${mine.length}`} sub={s.key !== slot}>
              {s.label}{s.key === slot ? " · now" : ""}
            </Section>
            {mine.map(r => {
              const on = observed.has(r.slug);
              return (
                <Row
                  key={r.slug}
                  mark={on ? "●" : "○"}
                  markOn={!on && s.key === slot}
                  done={on}
                  title={r.name}
                  meta={r.meta?.note ?? undefined}
                  value={r.meta?.japa ? "japa →" : r.meta?.portion ? "portion" : undefined}
                  onClick={() => mark(r.slug, r.name, s.key, !!r.meta?.japa)}
                />
              );
            })}
          </div>
        );
      })}

      <div className="btn-row">
        <button className="btn accent grow" onClick={() => { tap(); router.push("/anushtanas/japa"); }}>
          Open the counter
        </button>
      </div>

      <Note>
        Un-marking a rite does not delete it; it writes a second event saying
        so. The ledger is append-only, and a record that you changed your mind
        at 22:40 is worth more than a row that quietly disappeared.
        <br /><br />
        <b>Brahma-yajñam</b> records a portion once its canon is seeded. The
        corpus and its order differ by śākhā and sampradāya, so it must come
        from your paramparā rather than from a model — and once seeded,
        coverage is the one measure here with exact ground truth.
      </Note>
    </>
  );
}
