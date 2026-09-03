"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Display, Back, Note, Field, Stepper, Sheet } from "@/components/ui";
import { tap, bell } from "@/lib/haptics";
import { log } from "@/lib/ledger";
import { getMeta, setMeta } from "@/lib/db";

const DEFAULT_TARGET = 108;

/**
 * The counter.
 *
 * A full-screen tap target, a haptic per bead, a bell at the mālā. The
 * session survives a reload, the screen is kept awake, and a paired
 * Bluetooth clicker — which presents itself as a keyboard — also counts.
 */
export default function Japa() {
  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const wake = useRef<any>(null);

  /* restore an interrupted session */
  useEffect(() => {
    void (async () => {
      const s = await getMeta("japa", { count: 0, malas: 0, target: DEFAULT_TARGET });
      setCount(s.count); setMalas(s.malas); setTarget(s.target);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void setMeta("japa", { count, malas, target });
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

  const bead = useCallback(() => {
    setCount(c => {
      const next = c + 1;
      if (next >= target) {
        setMalas(m => {
          const mm = m + 1;
          void log("japa", { mantra: "Gāyatrī", count: target, target, malas: mm });
          return mm;
        });
        tap(3, 110);
        bell();
        return 0;
      }
      tap();
      return next;
    });
  }, [target]);

  /* a paired clicker presents as a keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if ([" ", "ArrowRight", "ArrowUp", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        bead();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bead]);

  const cells = 108;
  const filled = Math.round((count / target) * cells);

  return (
    <>
      <Back to="/anushtanas" label="Anuṣṭhānas" />
      <Display deck={<>Gāyatrī. Tap anywhere on the field below, or use a paired clicker.</>}>
        Ja<span className="thin">pa</span>
      </Display>

      <button className="pad" onClick={bead} aria-label={`Count a bead. ${count} of ${target}.`}>
        <span className="count">{String(count).padStart(3, "0")}</span>
        <span className="of">of {target}</span>
        <div className="beads" aria-hidden="true">
          {Array.from({ length: cells }, (_, i) => (
            <span key={i} className={"bead" + (i < filled ? " f" : "")} />
          ))}
        </div>
        <span className="hint">
          {count === 0 ? "Begin" : `${target - count} remaining`}
        </span>
      </button>

      <div className="btn-row">
        <button className="btn quiet grow" onClick={() => { tap(); setSettings(true); }}>Target</button>
        <button className="btn quiet grow" onClick={() => { tap(2); setCount(0); }}>Reset</button>
      </div>

      <div style={{ marginTop: 26 }} className="row">
        <span className="mk" aria-hidden="true">Σ</span>
        <span className="bd"><span className="t">Mālās completed</span><span className="m">This session</span></span>
        <span className="v">{malas}</span>
      </div>

      <Sheet title="Counter" open={settings} onClose={() => setSettings(false)}>
        <Field label="Beads to a mālā">
          <Stepper value={target} onChange={t => { setTarget(t); setCount(c => (c >= t ? 0 : c)); }}
                   step={1} min={1} max={1008} />
        </Field>
        <div className="btn-row">
          {[27, 54, 108, 1008].map(n => (
            <button key={n} className="btn sm quiet"
                    onClick={() => { tap(); setTarget(n); setCount(c => (c >= n ? 0 : c)); }}>
              {n}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn fill wide" onClick={() => setSettings(false)}>Done</button>
        </div>
      </Sheet>

      <Note>
        One pulse a bead; three and a bell at the mālā&rsquo;s end. Safari has never
        implemented <b>navigator.vibrate</b>, so the pulse comes from toggling a
        hidden switch control — the only route a web app has to the Taptic
        Engine. Each completed mālā is entered in the ledger; the count in
        progress is not, and survives a reload.
      </Note>
    </>
  );
}
