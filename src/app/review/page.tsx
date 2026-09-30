"use client";

import { useMemo, useState } from "react";
import {
  Display, Section, Row, Figures, Fig, Note, Sheet, Field, Text, Segmented, Spark, Empty,
} from "@/components/ui";
import { useAll, useEntities } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { tap } from "@/lib/haptics";
import { threads, week, featuresOf, WEIGHTS } from "@/core/account";
import { SCALES, SIGNALS } from "@/core/reflection";
import { sessionFor, UNIT } from "@/data/program";
import { localDate, slotFor, addDays } from "@/lib/time";

/**
 * Review.
 *
 * Three things, all read from the ledger. What is owed, ranked by a score
 * whose arithmetic is shown beside it. The evening line — kept as written,
 * with what Jev read in it listed underneath. And the week against the last,
 * in counts and sums only.
 */
export default function Review() {
  const all = useAll();
  const rites = useEntities("rite");
  const books = useEntities("book");
  const metrics = useEntities("metric");
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [text, setText] = useState("");

  const today = localDate();
  const now = new Date();
  const session = sessionFor(now.getDay()) ?? null;

  const owed = useMemo(() => threads({
    today, slot: slotFor(now), events: all,
    rites: rites.map(r => ({ slug: r.slug, name: r.name, slot: String(r.meta?.slot) })),
    session: session ? { name: session.name } : null,
    books: books.map(b => ({ slug: b.slug, name: b.name })),
    metrics: metrics.map(m => ({ slug: m.slug, name: m.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, rites, books, metrics, today]);

  const lines = useMemo(() => week(all, today, rites.length, UNIT), [all, today, rites.length]);
  const features = useMemo(() => featuresOf(all), [all]);
  const reflections = useMemo(() => all.filter(e => e.kind === "reflection"), [all]);
  const tonight = reflections.find(r => r.local_date === today && (r.payload as any)?.period === "day");

  /** Energy across the last fourteen lines Jev has read. */
  const energy = useMemo(() => reflections
    .map(r => features.get(r.client_id)?.energy)
    .filter((x): x is number => typeof x === "number")
    .slice(0, 14).reverse(), [reflections, features]);

  function compose(p: "day" | "week") {
    tap();
    setPeriod(p);
    setText("");
    setOpen(true);
  }

  async function save() {
    const t = text.trim();
    if (!t) return;
    tap();
    await log("reflection", { text: t, period }, { raw: t });
    setOpen(false);
  }

  const read = (id: string) => {
    const f = features.get(id);
    if (!f) return "Not yet read";
    const parts: string[] = [];
    for (const k of Object.keys(SCALES) as (keyof typeof SCALES)[]) {
      if (f[k] !== null) parts.push(`${k} ${Math.round(f[k]! * 100)}`);
    }
    for (const k of Object.keys(SIGNALS) as (keyof typeof SIGNALS)[]) if (f[k]) parts.push(k);
    return parts.join(" · ") || "Nothing clear";
  };

  const top = owed[0];

  return (
    <>
      <Display deck={top
        ? <>Most worth doing now: <b>{top.title.toLowerCase()}</b>. {owed.length} {owed.length === 1 ? "thread" : "threads"} open.</>
        : <>Nothing is owed. Every thread the ledger can see is closed.</>}>
        Re<span className="thin">view</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={owed.length} label="Open threads" hot={!!top && top.score >= 1.5} />
          <Fig value={reflections.filter(r => r.local_date >= addDays(today, -6)).length} label="Lines this week" />
          <Fig value={energy.length ? Math.round(energy[energy.length - 1] * 100) : "—"} unit={energy.length ? "%" : ""} label="Last energy" />
        </Figures>
      </div>

      <Section count={`${owed.length}`}>Owed</Section>
      {owed.map((t, i) => (
        <Row key={t.id} mark={i === 0 ? "!" : "·"} markOn={i === 0}
             title={t.title} meta={`${t.detail} · ${t.weight} × ${t.urgency}`}
             value={t.score.toFixed(2)} href={t.href} />
      ))}
      {!owed.length && <Empty title="Nothing owed.">A clear account. It will not stay that way for long.</Empty>}

      <Section count={tonight ? "written" : "open"}>Tonight</Section>
      {tonight ? (
        <Row mark="—" done title={(tonight.payload as any).text} meta={read(tonight.client_id)} />
      ) : (
        <Row mark="○" title="Write tonight's line" meta="A few words on the day — kept exactly as written"
             value="→" onClick={() => compose("day")} />
      )}

      {energy.length > 1 && (
        <>
          <Section count={`last ${energy.length}`}>Energy</Section>
          <Spark points={energy} />
        </>
      )}

      <Section count="7 days · 7 before">The week</Section>
      {lines.map(l => {
        const fmt = (v: number | null) => v === null ? "—" : `${v.toLocaleString()}${l.unit ? ` ${l.unit}` : ""}`;
        const better = l.now !== null && l.prev !== null && (l.down ? l.now < l.prev : l.now > l.prev);
        return (
          <Row key={l.label} mark={better ? "↑" : "·"} title={l.label}
               meta={`before ${fmt(l.prev)}`} value={fmt(l.now)} />
        );
      })}
      <div className="btn-row">
        <button className="btn quiet" onClick={() => compose("week")}>Write the week&rsquo;s verdict</button>
      </div>

      {reflections.length > 0 && (
        <>
          <Section count={`${reflections.length}`}>Lines</Section>
          {reflections.slice(0, 14).map(r => (
            <Row key={r.client_id} mark={(r.payload as any).period === "week" ? "▤" : "·"}
                 title={(r.payload as any).text} meta={`${r.local_date} · ${read(r.client_id)}`} />
          ))}
        </>
      )}

      <Sheet title={period === "week" ? "The week" : "Tonight"} open={open} onClose={() => setOpen(false)}>
        <div style={{ marginBottom: 16 }}>
          <Segmented value={period} onChange={setPeriod}
                     options={[{ value: "day", label: "The day" }, { value: "week", label: "The week" }]} />
        </div>
        <Field label={period === "week" ? "What the week was" : "How the day went"}>
          <Text value={text} onChange={setText} area autoFocus
                placeholder={period === "week" ? "What held, what slipped, what next." : "Plainly. A line is enough."} />
        </Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={save} disabled={!text.trim()}>Keep it</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Every thread is a fact computed from the ledger, scored as
        weight&nbsp;×&nbsp;urgency. The weights — pain {WEIGHTS.pain}, a run
        about to break {WEIGHTS.streak}, rites {WEIGHTS.rites}, down to a book
        set aside {WEIGHTS.book} — are in <b>src/core/account.ts</b>. When the
        order is wrong, change a number there. With Jev on, each line is read
        for energy, mood, stress and focus on described levels, and for pain,
        a skipped practice, a person, gratitude; nothing is ever written from
        it but those features.
      </Note>
    </>
  );
}
