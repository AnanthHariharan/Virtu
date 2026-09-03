"use client";

import { use, useState } from "react";
import { Display, Section, Row, Back, Note, Sheet, Field, Stepper, Empty, Figures, Fig } from "@/components/ui";
import { useEntities, useKind } from "@/hooks/useLedger";
import { log, patchState, archiveEntity } from "@/lib/ledger";
import { tap } from "@/lib/haptics";

/**
 * A book, and its lineage.
 *
 * Everything this book has produced, in the order it produced it: sessions
 * read, learnings filed under their heads, and the pieces those learnings
 * seeded. This is the knowledge graph appearing as navigation rather than as
 * a diagram — and it is the first place the ledger starts to feel like a
 * system that knows something.
 */
export default function Book({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const books = useEntities("book");
  const sessions = useKind("read");
  const notes = useKind("note");
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(0);

  const book = books.find(b => b.slug === id);

  if (!book) {
    return (
      <>
        <Back to="/read" label="Reading" />
        <Empty title="No such book.">It may have been closed. The sessions it produced are still in the ledger.</Empty>
      </>
    );
  }

  const page = Number(book.state?.page ?? 0);
  const total = Number(book.meta?.pages ?? 0);
  const mine = sessions.filter(e => e.payload?.book === book.slug);
  const drawn = notes.filter(e => e.payload?.source === book.slug);

  const pagesRead = mine.reduce((n, e) => n + (e.payload!.to - e.payload!.from), 0);
  const days = new Set(mine.map(e => e.local_date)).size;
  const pace = days ? Math.round(pagesRead / days) : 0;
  const left = total ? Math.max(0, total - page) : 0;

  async function record() {
    if (to <= page) return;
    tap();
    const capped = total ? Math.min(to, total) : to;
    await log("read", { book: book!.slug, name: book!.name, from: page, to: capped });
    await patchState(book!.id, { page: capped });
    setOpen(false);
  }

  return (
    <>
      <Back to="/read" label="Reading" />
      <Display deck={<>{book.meta?.author ? <>{book.meta.author}. </> : null}Page <b>{page}</b>{total ? <> of {total}</> : null}.</>}>
        {book.name}
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={total ? `${Math.round((page / total) * 100)}` : "—"} unit={total ? "%" : ""} label="Through" />
          <Fig value={pace || "—"} unit={pace ? "pp/d" : ""} label="Pace" />
          <Fig value={pace && left ? Math.ceil(left / pace) : "—"} unit={pace && left ? "d" : ""} label="Remaining" />
        </Figures>
      </div>

      <Section count={`${mine.length + drawn.length}`}>Lineage</Section>

      <Row mark="▸" title={`Read to page ${page}`}
           meta={total ? `${left} pages remaining` : "No page count set"}
           value={`${pagesRead} pp`} />

      {drawn.map(n => (
        <Row key={n.client_id} mark="·" title={n.payload!.text}
             meta={`Filed under ${n.payload!.headName ?? "no head"} · ${n.local_date}`} />
      ))}

      {mine.slice(0, 8).map(s => (
        <Row key={s.client_id} mark="—" title={`p. ${s.payload!.from} → ${s.payload!.to}`}
             meta={`Session · ${s.local_date}`}
             value={`${s.payload!.to - s.payload!.from} pp`} />
      ))}

      {!mine.length && !drawn.length && (
        <Empty title="Nothing has come of it yet.">
          A book with a long lineage has earned its shelf. One with none is a
          book you have been reading <i>at</i>.
        </Empty>
      )}

      <div className="btn-row">
        <button className="btn accent grow"
                onClick={() => { tap(); setTo(page + Math.max(pace, 10)); setOpen(true); }}>
          Record a session
        </button>
        <button className="btn quiet" onClick={() => { tap(); void archiveEntity(book.id); }}>
          Close
        </button>
      </div>

      <Sheet title="Session" open={open} onClose={() => setOpen(false)}>
        <Field label="Read to page">
          <Stepper value={to} onChange={setTo} step={1} min={page + 1} max={total || 9999} unit="pp" />
        </Field>
        <p className="lede">From page {page}. That is {Math.max(0, to - page)} pages.</p>
        <div className="btn-row">
          <button className="btn accent grow" onClick={record} disabled={to <= page}>Record</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        The page number is a cache of what the sessions already say; the
        sessions remain the record of how you got there. Closing a book
        archives it and leaves every one of its entries in the ledger.
      </Note>
    </>
  );
}
