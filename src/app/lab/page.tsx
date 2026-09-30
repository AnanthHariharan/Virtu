"use client";

import { useEffect, useMemo, useState } from "react";
import { Display, Section, Row, Figures, Fig, Note, Sheet, Field, Stepper, Empty, Segmented } from "@/components/ui";
import { useAll, useKind, useEntities } from "@/hooks/useLedger";
import { forecast, TARGETS, MIN_DAYS, type Target } from "@/core/model";
import { localDate } from "@/lib/time";
import { examples, reliability, ece, sweep, suggestThreshold, replay, type Example } from "@/core/lab";
import { GATES, type Gates } from "@/core/triage";
import { currentGates, setGates } from "@/lib/judge";
import { tap } from "@/lib/haptics";

const pct = (x: number | null | undefined) => x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;
const range = (a: number, b: number) => `${a.toFixed(1)}–${b.toFixed(1)}`;

type Flat = { floor: number; field: number; happened: number; kind: number; head: number };
const flat = (g: Gates): Flat => ({ floor: g.floor, field: g.field, happened: g.happened, kind: g.autoNote.kind, head: g.autoNote.head });
const nest = (f: Flat): Gates => ({ floor: f.floor, field: f.field, happened: f.happened, autoNote: { kind: f.kind, head: f.head } });

const KNOBS: { key: keyof Flat; label: string; hint: string }[] = [
  { key: "kind", label: "File a note unasked — kind", hint: "How sure Jev must be that it is a note" },
  { key: "head", label: "File a note unasked — head", hint: "How sure Jev must be of the head" },
  { key: "floor", label: "Propose anything at all", hint: "Below this, the capture waits for you" },
  { key: "field", label: "Trust a field", hint: "Below this, a lift or a number counts as unanswered" },
  { key: "happened", label: "Already happened", hint: "Below this, figures read as a plan" },
];

/**
 * The lab.
 *
 * Every accept, amendment, refile, undo and refusal in the inbox is a
 * label. This page holds Jev's stated confidence up against them — the
 * check that calibration is a claim about, and the only honest basis for a
 * threshold — and lets the gates be tuned against the record, with a replay
 * of what would have changed before anything is applied.
 */
export default function Lab() {
  const all = useAll();
  const judgments = useKind("judgment");
  const verdicts = useKind("verdict");
  const [gates, setLive] = useState<Gates>(GATES);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Flat>(flat(GATES));

  useEffect(() => { void currentGates().then(setLive); }, []);

  /* what the days predict */
  const rites = useEntities("rite");
  const [target, setTarget] = useState<Target>("sleep");
  const report = useMemo(
    () => forecast(all as any, rites.length, target, localDate()), [all, rites.length, target]);
  const spec = TARGETS[target];
  const fmtY = (v: number) => spec.kind === "binary" ? pct(v) : `${v.toFixed(1)} ${spec.unit}`;
  const fmtErr = (v: number) => spec.kind === "binary" ? v.toFixed(3) : `${v.toFixed(2)} ${spec.unit}`;

  const { proposals, fields } = useMemo(
    () => examples(judgments as any, verdicts as any, all as any), [judgments, verdicts, all]);

  const bins = useMemo(() => reliability(proposals), [proposals]);
  const error = ece(bins);
  const notes = proposals.filter(p => p.kind === "note");
  const points = useMemo(() => sweep(notes), [notes]);
  const suggested = suggestThreshold(points);

  const byQuestion = useMemo(() => {
    const m = new Map<string, Example[]>();
    for (const f of fields) m.set(f.question, [...(m.get(f.question) ?? []), f]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [fields]);

  const models = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of judgments) if (j.payload) m.set(j.payload.model, (m.get(j.payload.model) ?? 0) + 1);
    return [...m.entries()];
  }, [judgments]);

  const preview = useMemo(() => replay(judgments as any, nest(draft)), [judgments, draft]);
  const moved = (from: string, to: string) => preview.changed.filter(c => c.from === from && c.to === to).length;
  const tuned = KNOBS.some(k => flat(gates)[k.key] !== flat(GATES)[k.key]);

  function openTuner() {
    tap();
    setDraft(flat(gates));
    setOpen(true);
  }

  async function apply(g: Gates | null) {
    tap(2);
    await setGates(g);
    setLive(g ?? GATES);
    setOpen(false);
  }

  const accepted = proposals.filter(p => p.correct).length;

  return (
    <>
      <Display deck={proposals.length
        ? <>{proposals.length} proposals labelled by your verdicts. Of those Jev made at 0.8 or above,{" "}
            <b>{pct(sweep(proposals, [0.8])[0].precision)}</b> were right as they stood.</>
        : <>Nothing to measure yet. Every proposal you accept, amend or refuse in the inbox becomes a label here.</>}>
        L<span className="thin">ab</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={proposals.length} label="Labels" />
          <Fig value={error === null ? "—" : (error * 100).toFixed(1)} unit={error === null ? "" : "pt"} label="Calibration error" />
          <Fig value={pct(proposals.length ? accepted / proposals.length : null)} label="Right as proposed" />
        </Figures>
      </div>

      <Section count={`${bins.length} bins`}>Said against right</Section>
      {bins.map(b => (
        <Row key={b.from} mark={b.accuracy + 0.1 < b.confidence ? "↓" : b.accuracy > b.confidence + 0.1 ? "↑" : "·"}
             title={range(b.from, b.to)} meta={`${b.n} · said ${pct(b.confidence)}`} value={`${pct(b.accuracy)} right`} />
      ))}
      {!bins.length && <Empty title="No labels.">Accept or refuse a few proposals in the inbox.</Empty>}

      {byQuestion.length > 0 && (
        <>
          <Section count={`${fields.length}`}>By question</Section>
          {byQuestion.map(([q, xs]) => (
            <Row key={q} mark="·" title={q}
                 meta={`${xs.length} · said ${pct(xs.reduce((s, x) => s + x.confidence, 0) / xs.length)}`}
                 value={`${pct(xs.filter(x => x.correct).length / xs.length)} right`} />
          ))}
        </>
      )}

      <Section count={`${notes.length} ${notes.length === 1 ? "note" : "notes"}`}>Filing notes unasked</Section>
      {points.map(p => (
        <Row key={p.threshold} mark={p.threshold === suggested ? "◆" : "·"} markOn={p.threshold === suggested}
             title={`At ${p.threshold.toFixed(2)}`}
             meta={`${p.n} filed · ${pct(p.coverage)} of notes`} value={`${pct(p.precision)} right`} />
      ))}
      <p className="lede">
        {suggested === null
          ? "Not enough labels yet to suggest a threshold — it needs ten notes above a line, nine in ten of them right."
          : <>The lowest line at which nine in ten notes filed unasked were right is <b>{suggested.toFixed(2)}</b>.</>}
      </p>

      <Section count={tuned ? "tuned" : "defaults"}>Gates</Section>
      {KNOBS.map(k => (
        <Row key={k.key} mark="·" title={k.label} meta={k.hint} value={flat(gates)[k.key].toFixed(2)} />
      ))}
      <div className="btn-row">
        <button className="btn quiet" onClick={openTuner}>Tune the gates</button>
      </div>

      <Section count={spec.label.toLowerCase()}>What the days predict</Section>
      <div style={{ marginTop: 14 }}>
        <Segmented value={target} onChange={setTarget}
                   options={[{ value: "sleep", label: "Sleep" }, { value: "rites", label: "Rites" }]} />
      </div>
      {report.status === "insufficient" && (
        <Row mark="·" title="Not enough days yet"
             meta={`${report.labelled} of ${MIN_DAYS} days with a known outcome${target === "sleep" ? " — log sleep each morning" : ""}`} />
      )}
      {report.status === "no-better" && (
        <Row mark="·" title="No better than the average"
             meta={`On the ${report.test} latest days, off by ${fmtErr(report.score!)} against ${fmtErr(report.baseline!)} by always guessing the average`} />
      )}
      {report.status === "useful" && (
        <>
          <Row mark="◆" markOn title="Tomorrow" value={report.tomorrow === null ? "—" : fmtY(report.tomorrow)}
               meta={`On the ${report.test} latest days, which it never saw: off by ${fmtErr(report.score!)}, against ${fmtErr(report.baseline!)} by the average`} />
          {report.drivers.slice(0, 5).map(d => (
            <Row key={d.feature} mark={d.effect > 0 ? "↑" : "↓"} title={d.label}
                 meta={`one standard deviation ${d.effect > 0 ? "raises" : "lowers"} it`}
                 value={spec.kind === "binary" ? `${d.effect > 0 ? "+" : ""}${d.effect.toFixed(2)}` : `${d.effect > 0 ? "+" : ""}${d.effect.toFixed(2)} ${spec.unit}`} />
          ))}
        </>
      )}

      {models.length > 0 && (
        <>
          <Section count={`${models.length}`}>Models</Section>
          {models.map(([m, n]) => <Row key={m} mark="·" title={m} value={`${n}`} />)}
        </>
      )}

      <Sheet title="Tune the gates" open={open} onClose={() => setOpen(false)}>
        {KNOBS.map(k => (
          <Field key={k.key} label={k.label}>
            <Stepper value={draft[k.key]} step={0.05} min={0} max={1}
                     onChange={v => setDraft(d => ({ ...d, [k.key]: v }))} />
          </Field>
        ))}
        <p className="lede">
          Replayed over {preview.total} past {preview.total === 1 ? "judgment" : "judgments"}:{" "}
          {preview.changed.length
            ? <><b>{preview.changed.length}</b> would change —{" "}
                {[["suggest", "auto"], ["auto", "suggest"], ["suggest", "leave"], ["leave", "suggest"], ["auto", "leave"]]
                  .map(([a, b]) => [a, b, moved(a, b)] as const).filter(([, , n]) => n > 0)
                  .map(([a, b, n]) => `${n} ${a} → ${b}`).join(", ")}.</>
            : "none would change."}
        </p>
        <div className="btn-row">
          <button className="btn accent grow" onClick={() => apply(nest(draft))}>Apply</button>
          <button className="btn quiet" onClick={() => apply(null)}>Defaults</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        A label is a verdict. A proposal is right if it was accepted exactly as
        proposed, or kept as filed; amending a figure, refiling a note, undoing
        it or refusing it all count against. Field by field, a choice is right
        if what was finally written kept it. Calibration error is the
        count-weighted gap between how sure Jev said it was and how often it
        was right. New gates apply to captures judged from now on — nothing
        already written is changed. The arithmetic is in <b>src/core/lab.ts</b>.
        <br /><br />
        The prediction is ridge (sleep) or logistic (rites) regression over one
        row per day — rites kept, sets, volume, minutes, pages, notes, last
        night&rsquo;s sleep, and what Jev read in the evening&rsquo;s line —
        fitted on the earlier three quarters of your days and scored on the
        rest it never saw. It is shown only when it beats always guessing the
        average; otherwise it says so. It is in <b>src/core/model.ts</b>.
      </Note>
    </>
  );
}
