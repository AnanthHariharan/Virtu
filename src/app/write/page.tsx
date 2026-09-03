"use client";

import { useMemo, useState } from "react";
import { Display, Section, Row, Note, Sheet, Field, Text, Empty, Figures, Fig } from "@/components/ui";
import { useKind } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { tap } from "@/lib/haptics";

const STATES = ["idea", "drafting", "published"] as const;
type State = typeof STATES[number];

export default function Writing() {
  const events = useKind("piece");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  /** Latest event per title wins; the log keeps the record of how it moved. */
  const pieces = useMemo(() => {
    const cur = new Map<string, { title: string; status: State; at: string }>();
    for (const e of [...events].reverse()) {
      const p = e.payload; if (!p?.title) continue;
      cur.set(p.title, { title: p.title, status: p.status, at: e.local_date });
    }
    return [...cur.values()].sort(
      (a, b) => STATES.indexOf(b.status) - STATES.indexOf(a.status) || a.title.localeCompare(b.title)
    );
  }, [events]);

  const count = (s: State) => pieces.filter(p => p.status === s).length;

  async function add() {
    const t = title.trim();
    if (!t) return;
    tap();
    await log("piece", { title: t, status: "idea" });
    setTitle(""); setOpen(false);
  }

  async function advance(title: string, status: State) {
    const next = STATES[Math.min(STATES.indexOf(status) + 1, STATES.length - 1)];
    if (next === status) return;
    tap();
    await log("piece", { title, status: next });
  }

  return (
    <>
      <Display deck={<>Notion, to draft, to published. Three states and no more — a fourth would make this a project manager, which it is not.</>}>
        Writ<span className="thin">ing</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={count("idea")} label="Notions" />
          <Fig value={count("drafting")} label="In draft" hot={count("drafting") > 0} />
          <Fig value={count("published")} label="Published" />
        </Figures>
      </div>

      {STATES.map(s => {
        const mine = pieces.filter(p => p.status === s);
        if (!mine.length) return null;
        return (
          <div key={s}>
            <Section count={`${mine.length}`} sub={s === "published"}>{s}</Section>
            {mine.map(p => (
              <Row
                key={p.title}
                mark={s === "published" ? "●" : s === "drafting" ? "◐" : "○"}
                markOn={s === "drafting"}
                done={s === "published"}
                title={p.title}
                meta={`Last moved ${p.at}`}
                value={s === "published" ? undefined : "advance →"}
                onClick={s === "published" ? undefined : () => advance(p.title, p.status)}
              />
            ))}
          </div>
        );
      })}

      {!pieces.length && (
        <Empty title="Nothing yet.">The first notion is the hard one.</Empty>
      )}

      <div className="btn-row">
        <button className="btn accent grow" onClick={() => { tap(); setOpen(true); }}>Enter a notion</button>
      </div>

      <Sheet title="A notion" open={open} onClose={() => setOpen(false)}>
        <Field label="In one line">
          <Text value={title} onChange={setTitle} autoFocus placeholder="What is it about?" />
        </Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={add} disabled={!title.trim()}>Enter</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Tapping a piece advances it one state. Nothing moves backwards, because
        the log already shows every state it has been in.
      </Note>
    </>
  );
}
