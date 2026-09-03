"use client";

import { useRouter } from "next/navigation";
import { Opening, Fleuron, Sec, Versal, Entry } from "@/components/Page";
import { useToday, useEntities } from "@/hooks/useLedger";
import { useCabinet } from "@/hooks/useCabinet";
import { APPS, appOwning } from "@/lib/registry";
import { DOW, MON, SLOTS, slotFor, greeting } from "@/lib/time";
import { haptic } from "@/lib/haptics";
import type { NEvent } from "@/lib/types";

/**
 * The Daybook.
 *
 * Everything entered today, whatever instrument entered it, on one page.
 * This is the one-event-table architecture surfacing as an interface — and
 * it is the single thing that makes eight instruments feel like one book.
 */
export default function Daybook() {
  const router = useRouter();
  const today = useToday();
  const rites = useEntities("rite");
  const books = useEntities("book");
  const { enabled } = useCabinet();

  const now = new Date();
  const slot = slotFor(now);
  const slotLabel = SLOTS.find(s => s.key === slot)?.label.toLowerCase() ?? "";

  const observed = new Set(
    today.filter(e => e.kind === "rite" && e.payload?.observed).map(e => String(e.payload!.rite_slug))
  );
  const dueNow = rites.filter(r => r.meta?.slot === slot);
  const outstanding = rites.filter(r => r.meta?.slot !== slot && !observed.has(r.slug));

  const sets = today.filter(e => e.kind === "workout_set");
  const volume = sets.reduce(
    (n, e) => n + Number(e.payload?.weight ?? 0) * Number(e.payload?.reps ?? 0), 0
  );

  /** One line per event. Adding an instrument means adding a case here — nothing else. */
  function line(e: NEvent) {
    const app = appOwning(e.kind);
    if (app && !enabled(app.id)) return null;
    const p = (e.payload ?? {}) as Record<string, any>;

    let title = "", note = "";
    switch (e.kind) {
      case "rite":
        if (!p.observed) return null;
        title = String(p.name ?? p.rite_slug); note = `rite · ${p.slot ?? ""}`; break;
      case "japa":
        title = `${p.count} of ${p.target}`; note = `japa · ${p.mantra ?? "gāyatrī"}`; break;
      case "portion":
        title = String(p.name ?? p.portion_slug); note = "brahma-yajñam"; break;
      case "workout_set":
        title = `${p.exercise ?? p.exercise_slug} — ${p.weight ? `${p.weight} × ${p.reps}` : `bw × ${p.reps}`}`;
        note = "training"; break;
      case "meal":
        title = p.status === "ate" ? String(p.name) : `${p.label ?? p.meal_slug} — ${p.status}`;
        note = `āhāra · ${p.time ?? ""}`; break;
      case "learning":
        title = String(p.text); note = `commonplace · ${p.locus ?? ""}`; break;
      case "reading":
        title = `${p.book} — p. ${p.from_page} to ${p.to_page}`;
        note = `${Number(p.to_page) - Number(p.from_page)} pages`; break;
      case "writing":
        title = String(p.title); note = `writing · ${p.status}`; break;
      case "project_step":
        title = String(p.step); note = `${p.project}`; break;
      case "note":
        title = e.raw ?? ""; note = e.status === "raw" ? "awaiting extraction" : "note"; break;
    }
    if (!title) return null;

    return (
      <Entry
        key={e.client_id}
        mark={app?.sigil ?? "❧"}
        title={title}
        note={note}
        onClick={app ? () => { haptic(1); router.push(app.route); } : undefined}
      />
    );
  }

  const stream = today.map(line).filter(Boolean);

  const standing = [
    { app: "reading",     label: `${books.length} books open`,
      note: books.map(b => b.name.split(" ")[0]).join(" · ") || "none", route: "/reading" },
    { app: "writing",     label: "Pieces in flight", note: "writing",     route: "/writing" },
    { app: "projects",    label: "Projects",         note: "plans",       route: "/projects" },
    { app: "commonplace", label: "Commonplace",      note: "under heads", route: "/commonplace" },
  ].filter(s => enabled(s.app));

  return (
    <>
      <Opening
        title={`${greeting(now)}'s `}
        em="Account"
        sub={`${DOW[now.getDay()]} · ${MON[now.getMonth()]} ${now.getDate()}`}
      />
      <Fleuron />

      <Versal letter="A">
        {`ll that has been entered today, from whichever instrument entered it. `}
        {`${observed.size} of ${rites.length} rites stand recorded`}
        {sets.length
          ? `, and ${sets.length} sets at ${volume.toLocaleString()} kg of volume.`
          : `, and the body rests.`}
      </Versal>

      {enabled("rites") && (
        <>
          <Sec mark="☾" tail={slotLabel}>Due now</Sec>
          {dueNow.map(r => (
            <Entry
              key={r.slug}
              mark={observed.has(r.slug) ? "✓" : "¶"}
              markTone={observed.has(r.slug) ? "gilt" : "rubric"}
              done={observed.has(r.slug)}
              title={r.name}
              note={r.meta?.japa ? "with Gāyatrī japa" : r.meta?.portion ? "daily portion" : undefined}
              right={r.meta?.japa ? "japa" : r.meta?.portion ? "portion" : undefined}
              onClick={() => { haptic(1); router.push("/rites"); }}
            />
          ))}
          {outstanding.length > 0 && (
            <p className="marginal">
              {outstanding.length} outstanding in another vessel — {outstanding.map(r => r.name.split(" ")[0]).join(", ")}.
            </p>
          )}
        </>
      )}

      <Sec mark="❧">Entered today</Sec>
      {stream.length ? stream : (
        <p className="note-it">
          The page is still blank. Anything you enter, anywhere, appears here.
        </p>
      )}

      <Sec mark="☞">Standing</Sec>
      {standing.map(s => {
        const def = APPS.find(a => a.id === s.app);
        return (
          <Entry
            key={s.app}
            mark={def?.sigil ?? "·"}
            markTone="dim"
            title={s.label}
            note={s.note}
            right="❯"
            onClick={() => { haptic(1); router.push(s.route); }}
          />
        );
      })}

      <p className="colophon">
        Entered by hand, on {DOW[now.getDay()]}.<br />
        Kept in one book, under many heads.
      </p>
    </>
  );
}
