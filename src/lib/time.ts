import type { Slot } from "./types";

export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTHS = ["January","February","March","April","May","June","July",
                       "August","September","October","November","December"];

export const SLOTS: { key: Slot; label: string; from: number; to: number }[] = [
  { key: "morning", label: "Morning", from: 4,  to: 11 },
  { key: "midday",  label: "Midday",  from: 11, to: 16 },
  { key: "evening", label: "Evening", from: 16, to: 21 },
  { key: "night",   label: "Night",   from: 21, to: 24 },
];

/** Which part of the day we are in. Before 04:00 still belongs to the night before. */
export function slotFor(d = new Date()): Slot {
  const h = d.getHours();
  for (const s of SLOTS) if (h >= s.from && h < s.to) return s.key;
  return "night";
}

/**
 * The user's calendar day, not UTC. `toISOString().slice(0,10)` rolls the
 * date over for anyone west of Greenwich logging in the evening, which is
 * exactly when most of these entries get made.
 */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Mon 03.09.2026" — the date line under the running head. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DAYS_SHORT[d.getDay()]} ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function longDate(d = new Date()): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 5 ? "Late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
}

/** Epley. Reliable to about six reps, which is where the working sets live. */
export function e1rm(weight: number, reps: number): number {
  return weight > 0 && reps > 0 ? Math.round(weight * (1 + reps / 30)) : 0;
}

/** Consecutive days ending today (or yesterday) on which `has` is true. */
export function streak(has: (date: string) => boolean, from = localDate()): number {
  let n = 0;
  let cursor = has(from) ? from : addDays(from, -1);
  while (has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}
