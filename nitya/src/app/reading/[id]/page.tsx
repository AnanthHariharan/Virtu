"use client";

import { use } from "react";
import { Opening, Back, Sec } from "@/components/Page";
import { useEntities, useEvents } from "@/hooks/useLedger";
import { logEvent, patchEntityState } from "@/lib/store";
import { haptic } from "@/lib/haptics";

/**
 * An entity page. Everything this book has produced, in the order it
 * produced it: sessions read, learnings entered under their heads, and the
 * pieces those learnings seeded.
 *
 * This is the knowledge graph appearing as navigation rather than as a
 * diagram — and it is the first place the ledger starts to feel like a
 * system that knows something.
 */
export default function Book({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const books = useEntities("book");
  const sessions = useEvents("reading");
  const learnings = useEvents("learning");
  const pieces = useEvents("writing");

  const book = books.find(b => b.slug === id);
  if (!book) {
    return (
      <>
        <Back to="/reading" label="Reading" />
        <p className="note-it">No such book in the ledger.</p>
      </>
    );
  }

  const page = Number(book.state?.page ?? 0);
  const total = Number(book.meta?.pages ?? 0);
  const mySessions = sessions.filter(e => e.payload?.book_slug === book.slug);
  const myLearnings = learnings.filter(e => e.payload?.source_slug === book.slug);
  const seeded = pieces.filter(e =>
    myLearnings.some(l => String(l.payload?.text ?? "").slice(0, 40) === String(e.payload?.from ?? "").slice(0, 40))
  );

  const pace = (() => {
    if (mySessions.length < 2) return null;
    const pages = mySessions.reduce(
      (n, e) => n + (Number(e.payload?.to_page ?? 0) - Number(e.payload?.from_page ?? 0)), 0);
    const days = new Set(mySessions.map(e => e.local_date)).size;
    return days ? Math.round(pages / days) : null;
  })();

  async function record() {
    const v = prompt(`Read to which page? (${book!.name})`, String(page));
    const to = parseInt(v ?? "", 10);
    if (!to || to <= page) return;
    haptic(1);
    await logEvent({
      kind: "reading",
      payload: { book_slug: book!.slug, book: book!.name, from_page: page, to_page: Math.min(to, total || to) },
      touches: [{ entityId: book!.id, role: "read" }],
    });
    await patchEntityState(book!.id, { page: Math.min(to, total || to) });
  }

  return (
    <>
      <Back to="/reading" label="Reading" />
      <Opening
        title={book.name}
        sub={`${book.meta?.author ?? ""} · page ${page}${total ? ` of ${total}` : ""}`}
      />

      <div className="rule-thin" />
      <Sec mark="❧">Lineage</Sec>

      <ul className="lineage">
        <li>
          <span className="t">Read to page {page}</span>
          <i>
            {total ? `${Math.round((page / total) * 100)} per cent · ${total - page} pages remaining` : "no page count set"}
            {pace ? ` · about ${pace} pages a day` : ""}
          </i>
        </li>

        {myLearnings.map(l => (
          <li key={l.client_id}>
            <span className="t">{String(l.payload?.text)}</span>
            <i>entered under {String(l.payload?.locus ?? "no head")} · {l.local_date}</i>
          </li>
        ))}

        {seeded.map(p => (
          <li key={p.client_id}>
            <span className="t">{String(p.payload?.title)}</span>
            <i>a piece, {String(p.payload?.status)}</i>
          </li>
        ))}

        {!myLearnings.length && !seeded.length && (
          <li><i>nothing has yet come of it</i></li>
        )}
      </ul>

      <div className="btn-row">
        <button className="btn red" onClick={record}>Record a session</button>
      </div>

      <p className="marginal">
        Everything this book has produced, in the order it produced it. A book with a
        long lineage has earned its shelf; one with none is a book you have been
        reading <em>at</em>.
      </p>
    </>
  );
}
