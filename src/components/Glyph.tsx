/**
 * The mark set.
 *
 * Ten geometric pictograms drawn on one 24-unit grid with a single stroke
 * weight and no fills — the Swiss pictogram discipline, which is that the
 * whole set must be recognisably one hand. Nothing here is a rounded
 * lifestyle icon; every mark is built from lines, circles and squares
 * aligned to the same grid the rest of the page uses.
 */

export type GlyphName =
  | "today" | "rites" | "train" | "meals" | "notes"
  | "read" | "write" | "work" | "measures" | "modules";

const PATHS: Record<GlyphName, React.ReactNode> = {
  // a leaf of the day: a page with its running head ruled off
  today: <><rect x="4" y="4" width="16" height="16" /><path d="M4 9h16" /></>,

  // sunrise over the horizon — the parts of the day
  rites: <><circle cx="12" cy="13" r="4.5" /><path d="M2 20h20" /><path d="M12 3v3" /></>,

  // a barbell, viewed square on
  train: <><path d="M3 12h18" /><rect x="5" y="8" width="3.5" height="8" /><rect x="15.5" y="8" width="3.5" height="8" /></>,

  // a plate, set on the table line
  meals: <><circle cx="12" cy="11" r="6.5" /><circle cx="12" cy="11" r="2" /><path d="M3 20h18" /></>,

  // ruled lines under a head — the commonplace page
  notes: <><path d="M4 6h10" /><path d="M4 12h16" /><path d="M4 18h13" /></>,

  // an open book
  read: <><path d="M12 6v14" /><path d="M12 6c-2.4-1.6-5-2-8-2v14c3 0 5.6.4 8 2" /><path d="M12 6c2.4-1.6 5-2 8-2v14c-3 0-5.6.4-8 2" /></>,

  // a nib, and the line it draws
  write: <><path d="M5 19l3-1L19.5 6.5a1.8 1.8 0 0 0-2.5-2.5L5.5 15.5 5 19z" /><path d="M14.5 7L17 9.5" /></>,

  // steps struck through
  work: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /><path d="M2.5 7h1.5" /></>,

  // a measurement over time
  measures: <><path d="M4 4v16h16" /><path d="M7 15l3.5-4.5 3 2.5L20 7" /></>,

  // the ecosystem: four instruments on one grid
  modules: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
};

export default function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="square" strokeLinejoin="miter"
      aria-hidden="true" focusable="false"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      {PATHS[name]}
    </svg>
  );
}
