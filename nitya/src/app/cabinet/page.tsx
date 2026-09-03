"use client";

import { Opening, Fleuron, Sec } from "@/components/Page";
import { APPS, FUTURE_APPS } from "@/lib/registry";
import { useCabinet } from "@/hooks/useCabinet";
import { haptic } from "@/lib/haptics";

export default function Cabinet() {
  const { enabled, toggle } = useCabinet();

  return (
    <>
      <Opening title="The " em="Cabinet" sub="Every instrument in the ledger" />
      <Fleuron />

      <p className="lede" style={{ fontStyle: "italic", fontSize: 16 }}>
        Each instrument owns a kind of entry and nothing more. Shut one and its entries
        remain in the Daybook — the events belong to the book, not to the instrument
        that wrote them. Cut another later and it inherits the same paper, the same
        marks, the same rules.
      </p>

      {APPS.map(a => {
        const on = enabled(a.id);
        return (
          <div className="cab" key={a.id}>
            <span className={"s" + (on ? "" : " off")} aria-hidden="true">{a.sigil}</span>
            <span className="b">
              <h4>{a.name}</h4>
              <p>{a.blurb}</p>
              <div className="owns">owns {a.ownsLabel}</div>
            </span>
            <button
              className={"t" + (on ? " on" : "")}
              disabled={a.fixed}
              onClick={() => { haptic(1); void toggle(a.id); }}
            >
              {a.fixed ? "always" : on ? "kept" : "shut"}
            </button>
          </div>
        );
      })}

      <Sec mark="✧">Not yet cut</Sec>

      {FUTURE_APPS.map(a => (
        <div className="cab future" key={a.name}>
          <span className="s off" aria-hidden="true">{a.sigil}</span>
          <span className="b">
            <h4>{a.name}</h4>
            <p>{a.blurb}</p>
            <div className="owns">would own {a.ownsLabel}</div>
          </span>
          <span className="t">later</span>
        </div>
      ))}

      <p className="colophon">
        Adding an instrument is three steps: a row in the registry, a route folder,
        and a case in the Daybook&rsquo;s line renderer. Nothing else needs to know.
      </p>
    </>
  );
}
