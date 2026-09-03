"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Display, Section, Figures, Fig, Note, Sheet, Field, Text,
  Chips, Segmented, Stepper, Empty,
} from "@/components/ui";
import { useDay, useEntities, useAll } from "@/hooks/useLedger";
import { log } from "@/lib/ledger";
import { getMeta, setMeta } from "@/lib/db";
import {
  BOWLS, AISLES, ITEMS, DISMISSALS, bowlBySlug, groceryList, amount,
} from "@/data/menu";
import { longDate, streak } from "@/lib/time";
import { tap } from "@/lib/haptics";
import type { Entity, VEvent } from "@/lib/types";

type View = "table" | "cooking" | "grocery";

/**
 * The table.
 *
 * Two bowls a day, drawn from five. Three views over the same data: what you
 * ate, how the bowls are built, and what they add up to at the shop. The
 * third falls out of the first two — a grocery list you maintain by hand goes
 * stale the first week you change a recipe.
 */
export default function Meals() {
  const sittings = useEntities("meal");
  const day = useDay();
  const all = useAll();
  const [view, setView] = useState<View>("table");

  const today = useMemo(
    () => day.filter(e => e.kind === "meal") as VEvent<"meal">[], [day]
  );
  const latest = (slug: string) => today.find(e => e.payload?.slug === slug)?.payload;

  const taken = sittings.filter(s => latest(s.slug)?.status === "ate");
  const kcal = taken.reduce((n, s) => n + Number(latest(s.slug)?.kcal ?? 0), 0);
  const protein = taken.reduce((n, s) => n + Number(latest(s.slug)?.protein ?? 0), 0);

  const run = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of all) {
      if (e.kind !== "meal" || (e.payload as any)?.status !== "ate") continue;
      byDate.set(e.local_date, (byDate.get(e.local_date) ?? 0) + 1);
    }
    return streak(d => (byDate.get(d) ?? 0) >= sittings.length && sittings.length > 0);
  }, [all, sittings.length]);

  return (
    <>
      <Display deck={<>{longDate()}. <b>{taken.length} of {sittings.length}</b> bowls taken{kcal ? <>, {kcal.toLocaleString()} kcal and {protein} g of protein.</> : "."}</>}>
        The <span className="thin">table</span>
      </Display>

      <div style={{ marginTop: 26 }}>
        <Figures cols={3}>
          <Fig value={kcal ? kcal.toLocaleString() : "0"} label="Calories" />
          <Fig value={protein} unit="g" label="Protein" />
          <Fig value={run} unit="d" label="Streak" hot={run >= 7} />
        </Figures>
      </div>

      <div style={{ marginTop: 26 }}>
        <Segmented
          value={view} onChange={setView}
          options={[
            { value: "table", label: "Today" },
            { value: "cooking", label: "Cooking" },
            { value: "grocery", label: "Grocery" },
          ]}
        />
      </div>

      {view === "table"   && <TableView sittings={sittings} latest={latest} />}
      {view === "cooking" && <CookingView />}
      {view === "grocery" && <GroceryView />}
    </>
  );
}

/* ══ today ════════════════════════════════════════════════════════════ */

function TableView({ sittings, latest }: {
  sittings: Entity[];
  latest: (slug: string) => VEvent<"meal">["payload"] | undefined;
}) {
  const [serving, setServing] = useState<Entity | null>(null);
  const [bowl, setBowl] = useState<string | null>(BOWLS[0].slug);
  const [dismissing, setDismissing] = useState<Entity | null>(null);
  const [cause, setCause] = useState(DISMISSALS[0]);
  const [other, setOther] = useState("");

  async function eat() {
    if (!serving) return;
    const b = bowl ? bowlBySlug(bowl) : undefined;
    tap();
    await log("meal", {
      slug: serving.slug, name: serving.name, slot: String(serving.meta?.label ?? ""),
      status: "ate", bowl: b?.slug ?? null, bowlName: b?.name ?? null,
      kcal: b?.kcal, protein: b?.protein,
    });
    setServing(null);
  }

  async function dismiss() {
    if (!dismissing) return;
    const c = cause === "Other" ? (other.trim() || "Other") : cause;
    tap();
    await log("meal", {
      slug: dismissing.slug, name: dismissing.name,
      slot: String(dismissing.meta?.label ?? ""), status: c,
      note: other.trim() || undefined,
    });
    setDismissing(null); setOther(""); setCause(DISMISSALS[0]);
  }

  async function clear(s: Entity) {
    tap(2);
    await log("meal", {
      slug: s.slug, name: s.name, slot: String(s.meta?.label ?? ""), status: "unset",
    });
  }

  return (
    <>
      <Section count="two bowls">Sittings</Section>

      {sittings.map(s => {
        const p = latest(s.slug);
        const ate = p?.status === "ate";
        const skipped = !!p && p.status !== "ate" && p.status !== "unset";
        return (
          <div className="row timed" key={s.slug}>
            <span className="mk num" aria-hidden="true">{String(s.meta?.time ?? "")}</span>
            <span className="bd">
              <span className="t" style={ate ? { color: "var(--ink-3)", textDecoration: "line-through" } : undefined}>
                {ate && p?.bowlName ? `${s.name} — ${p.bowlName}` : s.name}
              </span>
              <span className="m">
                {skipped ? `Dismissed — ${p!.status}`
                  : ate ? `${p!.kcal} kcal · ${p!.protein} g protein`
                  : String(s.meta?.label ?? "")}
              </span>
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              {ate || skipped ? (
                <button className="btn sm quiet" onClick={() => clear(s)}>Undo</button>
              ) : (
                <>
                  <button className="btn sm fill"
                          onClick={() => { tap(); setBowl(BOWLS[0].slug); setServing(s); }}>
                    Serve
                  </button>
                  <button className="btn sm quiet" onClick={() => { tap(); setDismissing(s); }}>
                    Skip
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}

      <Sheet title={`${serving?.name ?? ""} — which bowl?`} open={!!serving} onClose={() => setServing(null)}>
        <Chips value={bowl} onChange={setBowl}
               options={BOWLS.map(b => ({ value: b.slug as string | null, label: b.name }))} />
        {bowl && (() => {
          const b = bowlBySlug(bowl)!;
          return (
            <>
              <p className="lede">{b.kcal} kcal · {b.protein} g protein · {b.ingredients.length} ingredients</p>
              <div style={{ marginTop: 14 }}>
                {b.ingredients.map(i => (
                  <Ing key={i.item} item={i.item} g={i.g} hint={i.hint} />
                ))}
              </div>
            </>
          );
        })()}
        <div className="btn-row">
          <button className="btn accent grow" onClick={eat} disabled={!bowl}>Ate it</button>
          <button className="btn quiet" onClick={() => setServing(null)}>Cancel</button>
        </div>
      </Sheet>

      <Sheet title={`Dismiss — ${dismissing?.name ?? ""}`} open={!!dismissing} onClose={() => setDismissing(null)}>
        <span className="label">Cause</span>
        <Chips value={cause} onChange={setCause} options={DISMISSALS.map(d => ({ value: d, label: d }))} />
        {cause === "Other" && (
          <Field label="In your own words">
            <Text value={other} onChange={setOther} placeholder="Why not?" autoFocus />
          </Field>
        )}
        <div className="btn-row">
          <button className="btn accent grow" onClick={dismiss}>Record</button>
          <button className="btn quiet" onClick={() => setDismissing(null)}>Cancel</button>
        </div>
        <p className="foot-note">
          The cause is the record. A blank skip tells you nothing in six months;
          &ldquo;travelling&rdquo; three Fridays running tells you a great deal.
        </p>
      </Sheet>
    </>
  );
}

/* ══ cooking ══════════════════════════════════════════════════════════ */

function Ing({ item, g, hint }: { item: string; g: number; hint?: string }) {
  const def = ITEMS[item];
  return (
    <div className="ing">
      <span className="n">
        {def?.name ?? item}
        {def?.note && <i>{def.note}</i>}
      </span>
      <span className="q">
        {amount(g)}
        {hint && <em>{hint}</em>}
      </span>
    </div>
  );
}

function CookingView() {
  const [open, setOpen] = useState<string | null>(BOWLS[0].slug);
  return (
    <>
      <Section count={`${BOWLS.length} bowls`}>Cooking</Section>
      {BOWLS.map(b => {
        const on = open === b.slug;
        return (
          <div key={b.slug}>
            <button className={"row" + (on ? "" : "")}
                    onClick={() => { tap(); setOpen(on ? null : b.slug); }}>
              <span className={"mk" + (on ? " on" : "")} aria-hidden="true">{on ? "−" : "+"}</span>
              <span className="bd">
                <span className="t">{b.name}</span>
                <span className="m">{b.kcal} kcal · {b.protein} g protein</span>
              </span>
              <span className="v">{b.ingredients.length}</span>
            </button>
            {on && (
              <div className="recipe">
                {b.ingredients.map(i => <Ing key={i.item} item={i.item} g={i.g} hint={i.hint} />)}
                {b.note && <p className="recipe-note">{b.note}</p>}
              </div>
            )}
          </div>
        );
      })}
      <Note>
        Every quantity is in grams, because grams are the only measure that can
        be added up — the household measures beside them are hints. Change a
        bowl in <b>src/data/menu.ts</b> and the grocery list changes with it.
      </Note>
    </>
  );
}

/* ══ grocery ══════════════════════════════════════════════════════════ */

const DEFAULT_COUNTS: Record<string, number> = Object.fromEntries(
  BOWLS.map(b => [b.slug, 3])          // 5 bowls × 3 ≈ the fourteen sittings in a week
);

function GroceryView() {
  const [counts, setCounts] = useState<Record<string, number>>(DEFAULT_COUNTS);
  const [ticked, setTicked] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      setCounts(await getMeta("grocery:counts", DEFAULT_COUNTS));
      setTicked(await getMeta<string[]>("grocery:ticked", []));
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) void setMeta("grocery:counts", counts); }, [counts, ready]);
  useEffect(() => { if (ready) void setMeta("grocery:ticked", ticked); }, [ticked, ready]);

  const list = useMemo(() => groceryList(counts), [counts]);
  const bowls = Object.values(counts).reduce((a, b) => a + b, 0);

  const toggle = (item: string) => {
    tap();
    setTicked(t => (t.includes(item) ? t.filter(x => x !== item) : [...t, item]));
  };

  return (
    <>
      <Section count={`${bowls} bowls`}>How many of each</Section>
      {BOWLS.map(b => (
        <div className="count-row" key={b.slug}>
          <span className="nm">{b.name}</span>
          <Stepper value={counts[b.slug] ?? 0}
                   onChange={v => setCounts(c => ({ ...c, [b.slug]: v }))}
                   step={1} min={0} max={21} />
        </div>
      ))}

      <Section count={`${list.length} items · ${ticked.length} in the basket`}>Grocery</Section>

      {!list.length && <Empty title="Nothing to buy.">Set a count above and the list builds itself.</Empty>}

      {AISLES.map(a => {
        const mine = list.filter(l => l.aisle === a.key);
        if (!mine.length) return null;
        return (
          <div key={a.key}>
            <Section sub count={`${mine.length}`}>{a.label}</Section>
            {mine.map(l => {
              const on = ticked.includes(l.item);
              return (
                <button className={"row" + (on ? " done" : "")} key={l.item}
                        onClick={() => toggle(l.item)}>
                  <span className={"mk" + (on ? "" : " on")} aria-hidden="true">{on ? "●" : "○"}</span>
                  <span className="bd">
                    <span className="t">{l.name}</span>
                    <span className="m">
                      {l.note ? `${l.note} — ` : ""}{l.from.join(", ")}
                    </span>
                  </span>
                  <span className="v">{amount(l.grams)}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      <div className="btn-row">
        <button className="btn quiet grow" onClick={() => { tap(2); setTicked([]); }}>
          Clear the basket
        </button>
      </div>

      <Note>
        The list is derived, never maintained. It expands prepared mixes into
        what you can actually put in a basket — the Indian bowl&rsquo;s kachumber
        arrives here as cucumber, tomato, onion and a lemon — and it sums an
        ingredient once across every bowl that uses it, so the rice in three
        bowls is one line.
      </Note>
    </>
  );
}
