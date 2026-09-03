"use client";

import { useState } from "react";
import { Display, Section, Row, Note, Sheet, Field, Text, Stepper, Empty, Figures, Fig } from "@/components/ui";
import { useEntities, useKind } from "@/hooks/useLedger";
import { putEntity } from "@/lib/ledger";
import { tap } from "@/lib/haptics";
import type { Entity } from "@/lib/types";

export default function Reading() {
  const books = useEntities("book");
  const sessions = useKind("read");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState(300);

  const read = sessions.reduce((n, e) => n + (e.payload!.to - e.payload!.from), 0);

  async function add() {
    const t = name.trim();
    if (!t) return;
    tap();
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const book: Entity = {
      id: `book:${slug}`, kind: "book", slug, name: t, aliases: [],
      meta: { author: author.trim(), pages }, state: { page: 0 },
      ord: books.length * 10, archived_at: null,
    };
    await putEntity(book);
    setName(""); setAuthor(""); setPages(300); setOpen(false);
  }

  return (
    <>
      <Display deck={<>Several at once, tracked by the page. <b>{read.toLocaleString()}</b> pages recorded across {books.length} {books.length === 1 ? "book" : "books"}.</>}>
        Read<span className="thin">ing</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={books.length} label="Open" />
          <Fig value={read.toLocaleString()} label="Pages read" />
          <Fig value={sessions.length} label="Sessions" />
        </Figures>
      </div>

      <Section count={`${books.length}`}>The shelf</Section>

      {books.map(b => {
        const page = Number(b.state?.page ?? 0);
        const total = Number(b.meta?.pages ?? 0);
        const pct = total ? Math.min(100, Math.round((page / total) * 100)) : 0;
        return (
          <Row
            key={b.slug}
            mark={`${pct}`}
            title={
              <>
                {b.name}
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </>
            }
            meta={[b.meta?.author, total ? `${total} pp` : null].filter(Boolean).join(" · ")}
            value={`p. ${page}`}
            href={`/read/${b.slug}`}
          />
        );
      })}

      {!books.length && (
        <Empty title="No books open.">
          Add one and every session, every learning drawn from it, and every
          piece it seeds will hang off its page.
        </Empty>
      )}

      <div className="btn-row">
        <button className="btn accent grow" onClick={() => { tap(); setOpen(true); }}>Open a book</button>
      </div>

      <Sheet title="Open a book" open={open} onClose={() => setOpen(false)}>
        <Field label="Title"><Text value={name} onChange={setName} autoFocus placeholder="Seeing Like a State" /></Field>
        <Field label="Author"><Text value={author} onChange={setAuthor} placeholder="James C. Scott" /></Field>
        <Field label="Pages"><Stepper value={pages} onChange={setPages} step={10} min={1} max={5000} unit="pp" /></Field>
        <div className="btn-row">
          <button className="btn accent grow" onClick={add} disabled={!name.trim()}>Add</button>
          <button className="btn quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>

      <Note>
        Open a book to record a session, read what it has taught you, and
        follow what has come of it.
      </Note>
    </>
  );
}
