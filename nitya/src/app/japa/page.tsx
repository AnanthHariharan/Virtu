"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Opening, Back } from "@/components/Page";
import { haptic, bell } from "@/lib/haptics";
import { logEvent } from "@/lib/store";
import { idb, safe } from "@/lib/idb";

const DEFAULT_TARGET = 108;

export default function Japa() {
  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [ready, setReady] = useState(false);
  const wake = useRef<any>(null);

  /* restore an interrupted session */
  useEffect(() => {
    void (async () => {
      const row = await safe(
        () => idb.get<{ key: string; value: { count: number; malas: number; target: number } }>("meta", "japa"),
        undefined
      );
      if (row?.value) { setCount(row.value.count); setMalas(row.value.malas); setTarget(row.value.target); }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void safe(() => idb.put("meta", { key: "japa", value: { count, malas, target } }), undefined);
  }, [count, malas, target, ready]);

  /* the screen must not sleep mid-count */
  useEffect(() => {
    const req = async () => {
      try { wake.current = await (navigator as any).wakeLock?.request("screen"); } catch {}
    };
    void req();
    const onVis = () => { if (!document.hidden) void req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try { wake.current?.release(); } catch {}
    };
  }, []);

  const tap = useCallback(() => {
    setCount(c => {
      const next = c >= target ? 1 : c + 1;
      if (next >= target) {
        setMalas(m => {
          const mm = m + 1;
          void logEvent({ kind: "japa", payload: { mantra: "gayatri", count: target, target, malas: mm } });
          return mm;
        });
        haptic(3, 110);
        bell();
      } else {
        haptic(1);
      }
      return next;
    });
  }, [target]);

  /* a paired Bluetooth clicker presents as a keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if ([" ", "ArrowRight", "ArrowUp", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        tap();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tap]);

  const shown = Math.min(target, 108);
  const filled = Math.round((count / target) * shown);

  return (
    <>
      <Back to="/rites" label="Anuṣṭhāna" />
      <Opening title="Ja" em="pa" sub="Gāyatrī · tap the leaf below" />

      <button className="pad" onClick={tap} aria-label={`Count. ${count} of ${target}.`}>
        <span className="count">{count}</span>
        <span className="of">of {target}</span>
        <div className="beads" aria-hidden="true">
          {Array.from({ length: shown }, (_, i) => (
            <span key={i} className={"bead" + (i < filled ? " f" : "")} />
          ))}
        </div>
        <span className="hint">
          {count === 0 ? "tap to count"
            : count >= target ? "complete — tap to begin another"
            : `${target - count} remaining`}
        </span>
      </button>

      <p className="malas">Mālās completed&nbsp; <b>{malas}</b></p>

      <div className="tgt">
        <label htmlFor="tgt">Target</label>
        <input
          id="tgt" type="number" min={1} max={1008} inputMode="numeric" value={target}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            const t = !v || v < 1 ? DEFAULT_TARGET : Math.min(v, 1008);
            setTarget(t);
            setCount(c => (c > t ? 0 : c));
          }}
        />
        <button className="btn" onClick={() => { haptic(1); setCount(0); }}>Reset</button>
      </div>

      <p className="colophon">
        A pulse at every bead; three pulses and a bell at the mālā&rsquo;s end.<br />
        A paired clicker sending space or arrow keys will also count.<br />
        Each completed mālā is entered in the ledger.
      </p>
    </>
  );
}
