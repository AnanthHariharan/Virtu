"use client";

import { useRouter } from "next/navigation";
import { Opening, Fleuron, Entry } from "@/components/Page";
import { useEntities } from "@/hooks/useLedger";
import { haptic } from "@/lib/haptics";

export default function Reading() {
  const router = useRouter();
  const books = useEntities("book");

  return (
    <>
      <Opening title="Read" em="ing" sub="Concurrent · by the page" />
      <Fleuron mark="♃" />

      {books.map(b => {
        const page = Number(b.state?.page ?? 0);
        const total = Number(b.meta?.pages ?? 0);
        const pct = total ? Math.round((page / total) * 100) : 0;
        return (
          <Entry
            key={b.slug}
            mark="♃"
            title={
              <>
                {b.name}
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </>
            }
            note={String(b.meta?.author ?? "")}
            right={`p. ${page}`}
            onClick={() => { haptic(1); router.push(`/reading/${b.slug}`); }}
          />
        );
      })}

      {!books.length && <p className="note-it">No books open. Seed some, or add one.</p>}

      <p className="note-it">
        Open a book to record a session, read what it has taught you, and follow
        what has come of it.
      </p>
    </>
  );
}
