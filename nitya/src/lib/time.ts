import type { Slot } from "./types";

export const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const MON = ["January","February","March","April","May","June","July",
                    "August","September","October","November","December"];

export const SLOTS: { key: Slot; label: string; from: number; to: number }[] = [
  { key: "morning",   label: "Morning",   from: 4,  to: 11 },
  { key: "afternoon", label: "Afternoon", from: 11, to: 16 },
  { key: "evening",   label: "Evening",   from: 16, to: 23 },
];

/** The vessel of the day we are currently in. Before 04:00 still counts as the previous evening. */
export function slotFor(d = new Date()): Slot {
  const h = d.getHours();
  for (const s of SLOTS) if (h >= s.from && h < s.to) return s.key;
  return h < 4 ? "evening" : "morning";
}

/**
 * The user's calendar day, not UTC. toISOString() would roll the date over
 * for anyone west of Greenwich logging an evening session.
 */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function folio(d = new Date()): string {
  return `${DOW[d.getDay()].slice(0, 3)} · ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

/** Epley. Good enough to 6-ish reps, which is where the working sets live. */
export function e1rm(weight: number, reps: number): number {
  return weight > 0 ? Math.round(weight * (1 + reps / 30)) : 0;
}
