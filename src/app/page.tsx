"use client";

import { useMemo } from "react";
import { Display, Section, Row, Figures, Fig, Empty, Note } from "@/components/ui";
import { useDay, useEntities, useModules, useAll } from "@/hooks/useLedger";
import { MODULES, moduleOwning } from "@/modules/registry";
import { sessionFor } from "@/data/program";
import { duration } from "@/data/activities";
import { SLOTS, slotFor, greeting, longDate, clock, streak } from "@/lib/time";
import { UNIT } from "@/data/program";

/**
 * Today.
 *
 * Everything entered today, from whichever module entered it, on one page.
 * This is the one-event-table architecture surfacing as an interface, and it
 * is the single thing that makes nine modules feel like one application
 * rather than nine.
 *
 * Note what is NOT here: no switch over event kinds. Each module carries its
 * own `describe()`, so this page renders modules it has never heard of, and a
 * module can be added without touching this file.
 */
export default function Today() {
  const day = useDay();
  const all = useAll();
  const rites = useEntities("rite");
  const meals = useEntities("meal");
  const { enabled } = useModules();

  const now = new Date();
  const slot = slotFor(now);
  const dow = now.getDay();
  const session = sessionFor(dow);

  /* ── the state of the day ── */

  const observed = useMemo(() => new Set(
    day.filter(e => e.kind === "rite" && (e.payload as any)?.observed)
       .map(e => String((e.payload as any).slug))
  ), [day]);

  const due = rites.filter(r => r.meta?.slot === slot && !observed.has(r.slug));
  const missed = rites.filter(r => {
    const i = SLOTS.findIndex(s => s.key === r.meta?.slot);
    return i > -1 && i < SLOTS.findIndex(s => s.key === slot) && !observed.has(r.slug);
  });

  const sets = day.filter(e => e.kind === "set");
  const activity = day.filter(e => e.kind === "activity");
  const activeMinutes = activity.reduce((n, e) => n + Number((e.payload as any)?.minutes ?? 0), 0);
  const volume = sets.reduce(
    (n, e) => n + Number((e.payload as any)?.weight ?? 0) * Number((e.payload as any)?.reps ?? 0), 0
  );

  const served = day.filter(e => e.kind === "meal" && (e.payload as any)?.status === "ate");
  const eaten = served.length;
  const kcal = served.reduce((n, e) => n + Number((e.payload as any)?.kcal ?? 0), 0);
  const protein = served.reduce((n, e) => n + Number((e.payload as any)?.protein ?? 0), 0);

  /* Adherence streak: consecutive days on which every rite was observed. */
  const riteStreak = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const e of all) {
      if (e.kind !== "rite" || !(e.payload as any)?.observed) continue;
      const s = byDate.get(e.local_date) ?? new Set();
      s.add(String((e.payload as any).slug));
      byDate.set(e.local_date, s);
    }
    return streak(d => (byDate.get(d)?.size ?? 0) >= rites.length && rites.length > 0);
  }, [all, rites.length]);

  /* ── the feed ── */

  const feed = day.map(e => {
    const mod = moduleOwning(e.kind);
    if (!mod || !enabled(mod.id)) return null;
    const line = mod.describe(e);
    if (!line) return null;
    return (
      <Row
        key={e.client_id}
        timed
        mark={clock(e.occurred_at)}
        title={line.title}
        meta={line.meta}
        value={line.value}
        done={line.done}
        href={mod.path}
      />
    );
  }).filter(Boolean);

  /* Standing invitations: what is open, from the modules that are on. */
  const standing = MODULES
    .filter(m => !m.nav && !m.core && enabled(m.id))
    .map(m => ({ ...m }));

  return (
    <>
      <Display
        deck={
          <>
            {longDate(now)}. {" "}
            {rites.length
              ? <><b>{observed.size} of {rites.length}</b> rites stand recorded</>
              : "No rites are set"}
            {sets.length
              ? <>, and <b>{sets.length} {sets.length === 1 ? "set" : "sets"}</b> at {volume.toLocaleString()} {UNIT} of volume</>
              : session ? <>, and <b>{session.name}</b> is unopened</>
              : activeMinutes ? <></> : <>, and the body rests</>}
            {activeMinutes
              ? <>, with <b>{duration(activeMinutes)}</b> of{" "}
                  {[...new Set(activity.map(e => String((e.payload as any)?.name ?? "").toLowerCase()))]
                    .join(" and ")}.</>
              : "."}
          </>
        }
      >
        {greeting(now)}&rsquo;s<br />
        <span className="thin">account</span>
      </Display>

      <div style={{ marginTop: 28 }}>
        <Figures cols={activeMinutes ? 4 : 3}>
          <Fig value={`${observed.size}/${rites.length || "—"}`} label="Rites" />
          <Fig value={volume ? volume.toLocaleString() : "0"} unit={UNIT} label="Volume" />
          {activeMinutes > 0 && <Fig value={activeMinutes} unit="min" label="Active" hot />}
          <Fig value={riteStreak} unit="d" label="Streak" hot={riteStreak >= 7} />
        </Figures>
      </div>

      {/* ── what is due ── */}
      {enabled("anushtanas") && (due.length > 0 || missed.length > 0) && (
        <>
          <Section count={SLOTS.find(s => s.key === slot)?.label}>Due now</Section>
          {due.map(r => (
            <Row key={r.slug} mark="○" markOn title={r.name}
                 meta={r.meta?.note ?? undefined} href="/anushtanas" />
          ))}
          {missed.map(r => (
            <Row key={r.slug} mark="—" title={r.name}
                 meta={`Outstanding · ${SLOTS.find(s => s.key === r.meta?.slot)?.label ?? ""}`}
                 href="/anushtanas" />
          ))}
        </>
      )}

      {/* ── the session, if the day has one ── */}
      {enabled("train") && session && (
        <>
          <Section count={`${sets.length} set${sets.length === 1 ? "" : "s"}`}>Session</Section>
          <Row mark="▶" markOn={!sets.length} title={session.name} meta={session.focus}
               value={sets.length ? `${volume.toLocaleString()} ${UNIT}` : `${session.movements.length} moves`}
               href="/train" />
        </>
      )}

      {/* ── the day's entries ── */}
      <Section count={`${feed.length}`}>Entered today</Section>
      {feed.length ? feed : (
        <Empty title="Nothing yet.">
          Anything entered anywhere in Virtu appears on this line, in the order
          it happened. Start with the rites, or press + to capture a line.
        </Empty>
      )}

      {/* ── meals ── */}
      {enabled("meals") && meals.length > 0 && (
        <>
          <Section count={`${eaten}/${meals.length}`}>Table</Section>
          <Row mark="▤" title={eaten ? `${kcal.toLocaleString()} kcal · ${protein} g protein` : "Nothing served yet"}
               meta={eaten
                 ? `${eaten} of ${meals.length} bowls`
                 : meals.map(m => m.name).join(" · ")}
               value="→" href="/meals" />
        </>
      )}

      {/* ── everything else that is open ── */}
      {standing.length > 0 && (
        <>
          <Section>Standing</Section>
          {standing.map(m => (
            <Row key={m.id} mark="·" title={m.name} meta={m.owns.join(" · ")} value="→" href={m.path} />
          ))}
        </>
      )}

      <Note>
        One ledger, many instruments. Every line above is a row in the same
        append-only table — which is why the day reads as one page, and why a
        module can be switched off without its history going with it.
      </Note>
    </>
  );
}
