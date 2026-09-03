"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tap } from "@/lib/haptics";

/* ══ page furniture ═════════════════════════════════════════════════ */

/**
 * The display line. `rule` sets one word in the accent; that is the only
 * place red appears in running text, and it appears exactly once per page.
 */
export function Display({ children, deck }: { children: React.ReactNode; deck?: React.ReactNode }) {
  return (
    <>
      <h1 className="display">{children}</h1>
      {deck && <p className="deck">{deck}</p>}
    </>
  );
}

export function Section({ children, count, sub }: {
  children: React.ReactNode; count?: React.ReactNode; sub?: boolean;
}) {
  return (
    <div className={sub ? "section sub" : "section"}>
      <h2>{children}</h2>
      <span className="fill" />
      {count !== undefined && <span className="count">{count}</span>}
    </div>
  );
}

/** The shared unit of every list in the app. */
export function Row({ mark, markOn, title, meta, value, done, timed, onClick, href }: {
  mark?: React.ReactNode;
  markOn?: boolean;
  title: React.ReactNode;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  done?: boolean;
  /** Widens the mark column to hold a clock time. */
  timed?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const router = useRouter();
  const cls = "row" + (done ? " done" : "") + (timed ? " timed" : "");
  const inner = (
    <>
      <span className={"mk" + (markOn ? " on" : "")} aria-hidden="true">{mark ?? ""}</span>
      <span className="bd">
        <span className="t">{title}</span>
        {meta && <span className="m">{meta}</span>}
      </span>
      {value !== undefined && <span className="v">{value}</span>}
    </>
  );
  if (!onClick && !href) return <div className={cls}>{inner}</div>;
  return (
    <button
      className={cls}
      onClick={() => { tap(); onClick ? onClick() : router.push(href!); }}
    >
      {inner}
    </button>
  );
}

export function Figures({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  return <div className="figures" style={{ ["--cols" as any]: cols }}>{children}</div>;
}

export function Fig({ value, unit, label, hot }: {
  value: React.ReactNode; unit?: string; label: string; hot?: boolean;
}) {
  return (
    <div>
      <span className={"fig-n" + (hot ? " hot" : "")}>
        {value}{unit && <span className="u">{unit}</span>}
      </span>
      <span className="fig-l">{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="foot-note">{children}</p>;
}

export function Back({ to, label }: { to: string; label: string }) {
  const router = useRouter();
  return (
    <button className="back" onClick={() => { tap(); router.push(to); }}>
      ← {label}
    </button>
  );
}

/* ══ the sheet ══════════════════════════════════════════════════════
   Every write in Virtu happens through one of these. It closes on Escape
   and on the scrim, restores focus to whatever opened it, and locks the
   body so an iOS sheet does not drag the page behind it. */

export function Sheet({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    // Move focus in, so a keyboard user is not left behind on the page.
    const first = panel.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not(.sheet-x)"
    );
    first?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ══ fields ═════════════════════════════════════════════════════════ */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Text({ value, onChange, placeholder, area, autoFocus }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; area?: boolean; autoFocus?: boolean;
}) {
  return area
    ? <textarea className="area" value={value} placeholder={placeholder} autoFocus={autoFocus}
                onChange={e => onChange(e.target.value)} />
    : <input className="input" value={value} placeholder={placeholder} autoFocus={autoFocus}
             onChange={e => onChange(e.target.value)} />;
}

/**
 * The stepper. Two square buttons and a tabular figure — a set can be logged
 * without a keyboard ever appearing, which is the whole difference between
 * logging in the gym and meaning to log it later.
 */
export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, unit }: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string;
}) {
  const dp = step < 1 ? String(step).split(".")[1].length : 0;
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(dp))));
  const bump = (d: number) => { tap(); onChange(clamp(value + d * step)); };
  return (
    <div className="stepper">
      <button type="button" onClick={() => bump(-1)} aria-label="Decrease">−</button>
      <input
        className="val num" type="number" inputMode="decimal" step={step}
        value={String(value)}
        onChange={e => onChange(clamp(Number(e.target.value) || 0))}
      />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" onClick={() => bump(1)} aria-label="Increase">+</button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value}
                className={o.value === value ? "on" : ""}
                onClick={() => { tap(); onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | null>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={String(o.value)}
                className={"chip" + (o.value === value ? " on" : "")}
                onClick={() => { tap(); onChange(o.value); }}>
          {o.label}
          {o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onToggle, disabled, label }: {
  on: boolean; onToggle: () => void; disabled?: boolean; label: string;
}) {
  return (
    <button className={"sw" + (on ? " on" : "")} disabled={disabled}
            role="switch" aria-checked={on} aria-label={label}
            onClick={() => { tap(); onToggle(); }}>
      <i aria-hidden="true" />
    </button>
  );
}

/**
 * A sparkline. Twelve points of anything, drawn against its own range —
 * the only chart in the app, because a number's direction is the one thing
 * a figure alone cannot tell you.
 */
export function Spark({ points }: { points: number[] }) {
  const id = useId();
  if (points.length < 2) return null;
  const lo = Math.min(...points), hi = Math.max(...points);
  const span = hi - lo || 1;
  const W = 100, H = 30;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * W,
    H - ((p - lo) / span) * (H - 4) - 2,
  ]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" key={id}>
      <path className="base" d={`M0 ${H - 1} L${W} ${H - 1}`} />
      <path d={d} />
      <circle cx={lx} cy={ly} r={1.8} />
    </svg>
  );
}

/** Local component state that survives a reload, for anything mid-flight. */
export function useSticky<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`virtu:${key}`);
      if (raw) setV(JSON.parse(raw) as T);
    } catch { /* private window; the default stands */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(`virtu:${key}`, JSON.stringify(v)); } catch {}
  }, [key, v, ready]);
  return [v, setV, ready] as const;
}
