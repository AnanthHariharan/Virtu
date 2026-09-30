"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Display, Section, Row, Figures, Fig, Note, Sheet, Field, Stepper, Chips, Empty,
} from "@/components/ui";
import { useEntities, useKind } from "@/hooks/useLedger";
import { buildInbox, type InboxItem, type Judgment } from "@/core/inbox";
import { captureText } from "@/core/commonplace";
import { describeProposal } from "@/core/triage";
import { accept, reject, keep, undoAuto, refile, judgePending, jevEnabled } from "@/lib/judge";
import { tap } from "@/lib/haptics";
import type { VEvent } from "@/lib/types";

/** The figures a proposal may carry, and how a stepper moves them. */
const FIGURES: Record<string, { label: string; step: number; max: number }> = {
  weight: { label: "Weight", step: 2.5, max: 500 },
  reps: { label: "Repetitions", step: 1, max: 100 },
  minutes: { label: "Minutes", step: 5, max: 480 },
  distance: { label: "Distance", step: 0.1, max: 100 },
  value: { label: "Value", step: 0.1, max: 1000 },
  from: { label: "From page", step: 1, max: 5000 },
  to: { label: "To page", step: 1, max: 5000 },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The inbox.
 *
 * What Jev made of each capture, read back from the ledger. Notes it was
 * sure of are already filed — listed here so any can be undone or refiled.
 * Anything that moves a figure is only offered, in a sheet, with the
 * figures on steppers. Every accept and refusal is written as a verdict:
 * the labels that later tune the thresholds.
 */
export default function Inbox() {
  const captures = useKind("capture");
  const notes = useKind("note");
  const judgments = useKind("judgment");
  const verdicts = useKind("verdict");
  const heads = useEntities("head");
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState<InboxItem<VEvent<"capture">> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [auto, setAuto] = useState<{ j: Judgment; note: VEvent<"note"> } | null>(null);
  const [head, setHead] = useState<string | null>(null);

  useEffect(() => { void jevEnabled().then(setOn); }, []);

  const inbox = useMemo(
    () => buildInbox(captures, notes, judgments as Judgment[], verdicts),
    [captures, notes, judgments, verdicts]);

  const by = (s: string) => inbox.items.filter(i => i.state === s);
  const offered = by("suggest"), partial = by("incomplete"), unclear = by("unclear"), waiting = by("waiting");

  function openItem(i: InboxItem<VEvent<"capture">>) {
    tap();
    setDraft({ ...(i.judgment?.payload?.proposal?.payload ?? {}) });
    setOpen(i);
  }

  async function doAccept() {
    if (!open?.judgment) return;
    tap(2);
    await accept(open.judgment as VEvent<"judgment">, open.capture, draft);
    setOpen(null);
  }

  async function doReject() {
    if (!open?.judgment) return;
    tap();
    await reject(open.judgment as VEvent<"judgment">);
    setOpen(null);
  }

  async function judgeNow() {
    tap();
    setBusy(true);
    try { await judgePending(); } finally { setBusy(false); }
  }

  const proposal = open?.judgment?.payload?.proposal;
  const figures = proposal ? Object.keys(FIGURES).filter(k => k in draft || proposal.missing.includes(k)) : [];
  const draftComplete = figures.every(k => typeof draft[k] === "number" && (k === "weight" || (draft[k] as number) > 0))
    && (proposal?.missing ?? []).every(m => m in FIGURES ? typeof draft[m] === "number" : false);

  return (
    <>
      <Display deck={<>Captures sorted by Jev. Notes it was sure of are filed; anything that
        moves a figure is <b>offered</b>, never written without you.</>}>
        In<span className="thin">box</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={offered.length + partial.length} label="Offered" hot={offered.length > 0} />
          <Fig value={inbox.auto.length} label="Filed by Jev" />
          <Fig value={waiting.length + unclear.length} label="Waiting" />
        </Figures>
      </div>

      {on === false && (
        <Empty title="Jev is off.">
          Captures stay in Commonplace until you file them. Switch triage on in{" "}
          <Link href="/settings">Settings</Link> to have them sorted as they arrive.
        </Empty>
      )}

      {offered.length > 0 && (
        <>
          <Section count={`${offered.length}`}>Offered</Section>
          {offered.map(i => {
            const p = i.judgment!.payload!.proposal!;
            return <Row key={i.capture.client_id} mark="○" markOn title={captureText(i.capture)}
                        meta={describeProposal(p)} value={pct(p.confidence)} onClick={() => openItem(i)} />;
          })}
        </>
      )}

      {partial.length > 0 && (
        <>
          <Section count={`${partial.length}`}>Needs a figure</Section>
          {partial.map(i => {
            const p = i.judgment!.payload!.proposal!;
            return <Row key={i.capture.client_id} mark="○" title={captureText(i.capture)}
                        meta={`${describeProposal(p)} — missing ${p.missing.join(", ")}`}
                        value={pct(p.confidence)} onClick={() => openItem(i)} />;
          })}
        </>
      )}

      {inbox.auto.length > 0 && (
        <>
          <Section count={`${inbox.auto.length}`}>Filed by Jev</Section>
          {inbox.auto.map(a => (
            <Row key={a.judgment.client_id} mark="—" done
                 title={a.note.payload!.text}
                 meta={`Note · ${a.note.payload!.headName ?? "no head"}`}
                 value={pct(a.judgment.payload!.proposal!.confidence)}
                 onClick={() => {
                   tap();
                   setHead(a.note.payload!.head);
                   setAuto({ j: a.judgment, note: a.note });
                 }} />
          ))}
        </>
      )}

      {(unclear.length > 0 || waiting.length > 0) && (
        <>
          <Section count={`${unclear.length + waiting.length}`}>For you</Section>
          {unclear.map(i => (
            <Row key={i.capture.client_id} mark="·" title={captureText(i.capture)}
                 meta="Unclear — file it by hand" value="→" href="/commonplace" />
          ))}
          {waiting.map(i => (
            <Row key={i.capture.client_id} mark="·" title={captureText(i.capture)}
                 meta={on ? "Not yet judged" : "Jev is off"} value="→" href="/commonplace" />
          ))}
        </>
      )}

      {on && waiting.length > 0 && (
        <div className="btn-row">
          <button className="btn quiet" onClick={judgeNow} disabled={busy}>
            {busy ? "Judging…" : "Judge now"}
          </button>
        </div>
      )}

      {!inbox.items.length && !inbox.auto.length && on !== false && (
        <Empty title="Nothing waiting.">Press + anywhere to capture a line; it is sorted here.</Empty>
      )}

      {/* ── a proposal ── */}
      <Sheet title={proposal ? describeProposal(proposal).split(" · ")[0] : ""} open={!!open}
             onClose={() => setOpen(null)}>
        {open && proposal && (
          <>
            <p className="lede">&ldquo;{captureText(open.capture)}&rdquo;</p>
            <p className="lede">{describeProposal({ ...proposal, payload: draft })}
              {" · "}{pct(proposal.confidence)} sure · {open.judgment!.payload!.model}</p>
            {figures.map(k => (
              <Field key={k} label={FIGURES[k].label}>
                <Stepper value={Number(draft[k] ?? 0)} step={FIGURES[k].step} min={0} max={FIGURES[k].max}
                         onChange={v => setDraft(d => ({ ...d, [k]: v }))} />
              </Field>
            ))}
            {proposal.missing.some(m => !(m in FIGURES)) && (
              <p className="lede">
                Jev could not tell the {proposal.missing.filter(m => !(m in FIGURES)).join(" or ")}.
                Refuse this and file it by hand.
              </p>
            )}
            <div className="btn-row">
              <button className="btn accent grow" onClick={doAccept}
                      disabled={!draftComplete || proposal.missing.some(m => !(m in FIGURES))}>
                Accept
              </button>
              <button className="btn quiet" onClick={doReject}>Refuse</button>
              <button className="btn quiet" onClick={() => setOpen(null)}>Cancel</button>
            </div>
          </>
        )}
      </Sheet>

      {/* ── a note Jev filed ── */}
      <Sheet title="Filed by Jev" open={!!auto} onClose={() => setAuto(null)}>
        {auto && (
          <>
            <p className="lede">&ldquo;{auto.note.payload?.text}&rdquo;</p>
            <span className="label">Under which head</span>
            <Chips value={head} onChange={setHead}
                   options={heads.map(h => ({ value: h.slug as string | null, label: h.name }))} />
            <div className="btn-row">
              <button className="btn accent grow" onClick={async () => {
                tap();
                const h = heads.find(x => x.slug === head);
                if (h && h.slug !== auto.note.payload?.head) {
                  await refile(auto.j as VEvent<"judgment">, auto.note, { slug: h.slug, name: h.name });
                } else {
                  await keep(auto.j as VEvent<"judgment">, auto.note);
                }
                setAuto(null);
              }}>
                {head && head !== auto.note.payload?.head ? "Refile" : "Keep"}
              </button>
              <button className="btn quiet" onClick={async () => {
                tap(2);
                await undoAuto(auto.j as VEvent<"judgment">, auto.note);
                setAuto(null);
              }}>Undo</button>
            </div>
          </>
        )}
      </Sheet>

      <Note>
        Each capture is sent once, as its text alone, with the names of your
        heads, books, lifts, sports, measures and projects as the options. Jev
        returns typed answers with calibrated confidence; the rules that turn
        those into an entry are in <b>src/core/triage.ts</b>, and the
        thresholds in <b>GATES</b>. Numbers are never generated — Jev only
        chooses which of the numbers you typed is which.
      </Note>
    </>
  );
}
