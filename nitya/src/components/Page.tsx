"use client";

import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";

export function Opening({ title, em, sub }: { title: string; em?: string; sub?: string }) {
  return (
    <div>
      <h2 className="title">
        {title}
        {em && <em>{em}</em>}
      </h2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function Fleuron({ mark = "❦" }: { mark?: string }) {
  return <div className="fleuron" aria-hidden="true">{mark}</div>;
}

export function Sec({ mark, children, tail }: { mark?: string; children: React.ReactNode; tail?: React.ReactNode }) {
  return (
    <div className="sec">
      {mark && <span className="n" aria-hidden="true">{mark}</span>}
      {children}
      {tail && <span className="tail">{tail}</span>}
    </div>
  );
}

export function Versal({ letter, children }: { letter: string; children: React.ReactNode }) {
  return (
    <p className="lede">
      <span className="versal" aria-hidden="true">{letter}</span>
      {children}
    </p>
  );
}

export function Back({ to, label }: { to: string; label: string }) {
  const r = useRouter();
  return (
    <button className="backlink" onClick={() => { haptic(1); r.push(to); }}>
      ❮ {label}
    </button>
  );
}

/** One ledger line. The shared unit of every instrument. */
export function Entry({
  mark, markTone, title, note, right, done, onClick,
}: {
  mark: string;
  markTone?: "rubric" | "dim" | "gilt";
  title: React.ReactNode;
  note?: React.ReactNode;
  right?: React.ReactNode;
  done?: boolean;
  onClick?: () => void;
}) {
  const cls = markTone === "dim" ? "mk dim" : markTone === "gilt" ? "mk gilt" : "mk";
  const inner = (
    <>
      <span className={cls} aria-hidden="true">{mark}</span>
      <span className="bd">
        <span className="t">{title}</span>
        {note && <i>{note}</i>}
      </span>
      {right && <span className="num">{right}</span>}
    </>
  );
  if (!onClick) return <div className={"entry" + (done ? " done" : "")}>{inner}</div>;
  return (
    <button className={"entry" + (done ? " done" : "")} onClick={onClick}>
      {inner}
    </button>
  );
}
