"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Display, Section, Note, Sheet, Field, Text, Chips, Empty, Figures, Fig } from "@/components/ui";
import { useEntities, useKind } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { tap } from "@/lib/haptics";

/**
 * The commonplace book.
 *
 * The Renaissance personal-knowledge technology: passages filed under
 * topical heads and cross-indexed to their sources. Erasmus, Locke and
 * Milton all kept one. "Learnings under heads, pointing at their sources"
 * remains a better interface to a knowledge graph than a graph is.
 *
 * Free captures from the + button land here too, unfiled, waiting for a head.
 */
export default function Commonplace() {
  const router = useRouter();
  const heads = useEntities("head");
  const books = useEntities("book");
  const notes = useKind("note");
  const captures = useKind("capture");

  const [head, setHead] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pickHead, setPickHead] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);   // a capture being filed

  const shown = useMemo(
    () => (head ? notes.filter(e => e.payload?.head === head) : notes),
    [notes, head]
  );

  async function save() {
    const t = text.trim();
    if (!t) return;
    tap();
    const h = heads.find(x => x.slug === pickHead);
    const b = books.find(x => x.slug === source);
    await log("note", {
      text: t,
      head: h?.slug ?? null, headName: h?.name ?? null,
      source: b?.slug ?? null, sourceName: b?.name ?? null,
    });
    setText(""); setSource(null); setFiling(null); setOpen(false);
  }

  function compose(seed?: string) {
    tap();
    setText(seed ?? "");
    setFiling(seed ?? null);
    setPickHead(head ?? heads[0]?.slug ?? null);
    setOpen(true);
  }

  const unfiled = captures.filter(c => {
    const t = (c.payload?.text ?? c.raw ?? "").trim();
    return t && !notes.some(n => n.payload?.text.trim() === t);
  });

  return (
    <>
      <Display deck={<>Learnings filed under heads, and indexed to the source they came from. <b>{notes.length}</b> entered.</>}>
        Common<span className="thin">place</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={notes.length} label="Notes" />
          <Fig value={heads.filter(h => notes.some(n => n.payload?.head === h.slug)).length} label="Heads in use" />
          <Fig value={unfiled.length} label="Unfiled" hot={unfiled.length > 0} />
        </Figures>
      </div>

      {unfiled.length > 0 && (
        <>
          <Section count={`${unfiled.length}`}>Awaiting a head</Section>
          {unfiled.map(c => (
            <button className="row" key={c.client_id} onClick={() => compose(c.payload?.text ?? c.raw ?? "")}>
              <span className="mk on" aria-hidden="true">○</span>
              <span className="bd">
                <span className="t">{c.payload?.text ?? c.raw}</span>
                <span className="m">Captured · {c.local_date}</span>
              </span>
              <span className="v">file →</span>
            </button>
          ))}
        </>
      )}

      <Section count={`${shown.length}`}>Heads</Section>
      <Chips
        value={head}
        onChange={setHead}
        options={[
          { value: null, label: "All", count: notes.length },
          ...heads.map(h => ({
            value: h.slug as string | null,
            label: h.name,
            count: notes.filter(n => n.payload?.head === h.slug).length,
          })),
        ]}
      />

      <div style={{ marginTop: 10 }}>
        {shown.map(e => {
          const p = e.payload!;
          const book = p.source ? books.find(b => b.slug === p.source) : undefined;
          return (
            <div className="note" key={e.client_id}>
              <div className="note-h">
                <span className="hd">{p.headName ?? "Unfiled"}</span>
                <span>{e.local_date}</span>
              </div>
              <div className="note-t">{p.text}</div>
              {book && (
                <button className="note-s" onClick={() => { tap(); router.push(`/read/${book.slug}`); }}>
                  → {book.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!shown.length && (
        <Empty title="Nothing under this head.">
          A head with nothing under it is a question you have not started
          answering yet.
        </Empty>
      )}

      <div className="btn-row">
        <button className="btn accent grow" onClick={() => compose()}>Enter a learning</button>
      </div>

      <Sheet title={filing ? "File this capture" : "A learning"} open={open} onClose={() => setOpen(false)}>
        <Field label="What did you learn?">
          <Text value={text} onChange={setText} area autoFocus
                placeholder="One thought, in your own words." />
        </Field>

        <div style={{ marginTop: 20 }}>
          <span className="label">Under which head</span>
          <Chips value={pickHead} onChange={setPickHead}
                 options={heads.map(h => ({ value: h.slug as string | null, label: h.name }))} />
        </div>

        {books.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <span className="label">From which book</span>
            <Chips value={source} onChange={setSource}
                   options={[
                     { value: null, label: "None" },
                     ...books.map(b => ({ value: b.slug as string | null, label: b.name })),
                   ]} />
          </div>
        )}

        <div className="btn-row">
          <button className="btn accent grow" onClick={save} disabled={!text.trim()}>File it</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        A note names its head and, where it has one, its source — so a book
        read becomes a head that grows, and the head is what you find your way
        back by. Heads live in <b>src/data/heads.ts</b>.
      </Note>
    </>
  );
}
