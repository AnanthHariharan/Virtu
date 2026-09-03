"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Opening, Fleuron } from "@/components/Page";
import { useEvents, useEntities } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { haptic } from "@/lib/haptics";

/**
 * The commonplace book — the Renaissance personal-knowledge technology.
 * Passages copied under topical heads (loci) and cross-indexed to their
 * sources. Erasmus, Locke and Milton all kept one; it is the direct
 * ancestor of everything we now call a second brain, and "learnings under
 * heads" remains a better interface to a knowledge graph than a graph.
 */
export default function Commonplace() {
  const router = useRouter();
  const loci = useEntities("locus");
  const books = useEntities("book");
  const learnings = useEvents("learning");
  const [head, setHead] = useState<string | null>(null);

  const shown = head ? learnings.filter(e => e.payload?.locus_slug === head) : learnings;

  async function add() {
    const text = prompt("What did you learn?");
    if (!text) return;
    const names = loci.map(l => l.name).join(" · ");
    const chosen = prompt(`Under which head?\n(${names})`, loci[0]?.name ?? "");
    const locus = loci.find(l => l.name.toLowerCase() === (chosen ?? "").toLowerCase()) ?? loci[0];
    const src = prompt("From which book? (blank for none)", "");
    const book = src ? books.find(b => b.name.toLowerCase().includes(src.toLowerCase())) : undefined;

    haptic(1);
    await logEvent({
      kind: "learning",
      payload: {
        text,
        locus_slug: locus?.slug ?? null,
        locus: locus?.name ?? null,
        source_slug: book?.slug ?? null,
        source: book?.name ?? null,
      },
      touches: book ? [{ entityId: book.id, role: "referenced" }] : undefined,
    });
  }

  return (
    <>
      <Opening title="Common" em="place" sub="Learnings, filed under heads" />
      <Fleuron mark="☞" />

      <p className="lede" style={{ fontStyle: "italic", fontSize: 16 }}>
        Every entry sits under a <em>locus</em> and, where it has one, names its source —
        so a passage read becomes a head that grows, and the head is what you later find
        your way back by.
      </p>

      <div className="loci">
        <button className={"locus" + (head === null ? " on" : "")}
                onClick={() => { haptic(1); setHead(null); }}>
          All heads
        </button>
        {loci.map(l => {
          const n = learnings.filter(e => e.payload?.locus_slug === l.slug).length;
          return (
            <button key={l.slug}
                    className={"locus" + (head === l.slug ? " on" : "")}
                    onClick={() => { haptic(1); setHead(l.slug); }}>
              {l.name} {n}
            </button>
          );
        })}
      </div>

      {shown.length === 0 && <p className="note-it">Nothing under this head yet.</p>}

      {shown.map(e => {
        const p = e.payload as Record<string, any>;
        const book = p.source_slug ? books.find(b => b.slug === p.source_slug) : undefined;
        return (
          <div className="cp" key={e.client_id}>
            <div className="cp-h">{p.locus ?? "unfiled"} &nbsp;·&nbsp; {e.local_date}</div>
            <div className="cp-t">{p.text}</div>
            {book && (
              <button className="cp-s" onClick={() => { haptic(1); router.push(`/reading/${book.slug}`); }}>
                ☞ {book.name}
              </button>
            )}
          </div>
        );
      })}

      <div className="btn-row">
        <button className="btn red" onClick={add}>Enter a learning</button>
      </div>
    </>
  );
}
