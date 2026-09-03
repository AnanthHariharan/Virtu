"use client";

import { Opening, Fleuron, Entry } from "@/components/Page";
import { useEvents } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { haptic } from "@/lib/haptics";

const STATES = ["idea", "drafting", "published"] as const;
type State = typeof STATES[number];

export default function Writing() {
  const events = useEvents("writing");

  /** Latest state per title wins; the log keeps how it got there. */
  const current = new Map<string, { title: string; status: State; from?: string; at: string }>();
  for (const e of [...events].reverse()) {
    const p = e.payload as Record<string, any>;
    if (!p?.title) continue;
    current.set(p.title, { title: p.title, status: p.status, from: p.from, at: e.local_date });
  }
  const pieces = [...current.values()].sort(
    (a, b) => STATES.indexOf(a.status) - STATES.indexOf(b.status) || a.title.localeCompare(b.title)
  ).reverse();

  async function add() {
    const title = prompt("The notion, in a line?");
    if (!title) return;
    haptic(1);
    await logEvent({ kind: "writing", payload: { title, status: "idea" } });
  }

  async function advance(title: string, status: State) {
    const i = STATES.indexOf(status);
    const next = STATES[Math.min(i + 1, STATES.length - 1)];
    if (next === status) return;
    haptic(1);
    await logEvent({ kind: "writing", payload: { title, status: next } });
  }

  return (
    <>
      <Opening title="Writ" em="ing" sub="Idea · drafting · published" />
      <Fleuron mark="☿" />

      {pieces.map(p => (
        <Entry
          key={p.title}
          mark={p.status === "published" ? "✓" : p.status === "drafting" ? "☿" : "¶"}
          markTone={p.status === "published" ? "gilt" : "rubric"}
          title={p.title}
          note={p.from ? `from — ${p.from}` : p.status}
          right={p.status !== "published" ? "❯" : undefined}
          onClick={() => advance(p.title, p.status)}
        />
      ))}

      {!pieces.length && <p className="note-it">Nothing yet. The first notion is the hard one.</p>}

      <div className="btn-row">
        <button className="btn red" onClick={add}>Enter a notion</button>
      </div>

      <p className="colophon">
        Three states and no more. A fourth would make this a project management
        application, which it is not. Tapping a piece advances it.
      </p>
    </>
  );
}
