import type { EventKind, VEvent } from "@/lib/types";
import type { GlyphName } from "@/components/Glyph";

/**
 * The ecosystem.
 *
 * Modules are DATA. Each one declares the event kinds it owns and how to read
 * one back as a line, and nothing else in the app knows it exists.
 *
 * This is the one thing worth changing from the previous version. There, the
 * home page held a `switch` over every event kind, so adding a module meant
 * editing the home page, and turning a module off could not be made to leave
 * its history intact without special cases. Here `describe()` travels with
 * the module: Today renders whatever the registry can describe, a disabled
 * module's entries still read correctly, and adding one is two files.
 *
 * Adding a module:
 *   1. A `Module` in the list below, with its `describe`.
 *   2. A route folder under `src/app/`.
 *   That is the whole procedure.
 */

export interface Line {
  /** The entry itself. */
  title: string;
  /** Small type beneath it: what kind of thing this was. */
  meta?: string;
  /** Right-aligned figure. Tabular; keep it short. */
  value?: string;
  /** Struck through — a thing completed rather than merely recorded. */
  done?: boolean;
}

export interface Module {
  id: string;
  /** Full name, for headers and the module index. */
  name: string;
  /** Nav label. Keep to one short word. */
  short: string;
  path: string;
  icon: GlyphName;
  /** One line, in the module index. */
  blurb: string;
  owns: EventKind[];
  /** Core modules cannot be switched off. */
  core?: boolean;
  /** Appears in the primary navigation. */
  nav?: boolean;
  /**
   * Read one of this module's events back as a line. Return null to keep it
   * out of the day's feed — an un-observed rite, say, which is a correction
   * rather than an entry.
   */
  describe(e: VEvent): Line | null;
}

const p = (e: VEvent) => (e.payload ?? {}) as any;
const n = (v: unknown) => Number(v ?? 0);

export const MODULES: Module[] = [
  {
    id: "today", name: "Today", short: "Today", path: "/", icon: "today",
    blurb: "Every entry from every module, on one page.",
    owns: [], core: true, nav: true,
    describe: () => null,
  },

  {
    id: "anushtanas", name: "Anuṣṭhānas", short: "Rites", path: "/anushtanas", icon: "rites",
    blurb: "Nitya-karma through the parts of the day, and the japa counter.",
    owns: ["rite", "japa", "portion"], nav: true,
    describe(e) {
      if (e.kind === "rite") {
        // An un-observing is a correction, not an entry. It belongs in the
        // log but not in the day's reading.
        return p(e).observed ? { title: p(e).name, meta: "Rite", done: true } : null;
      }
      if (e.kind === "portion") {
        return {
          title: p(e).name,
          meta: "Brahma-yajñam",
          value: `${n(p(e).index) + 1}/12`,
          done: true,
        };
      }
      return {
        title: `Japa — ${p(e).mantra}`,
        meta: `Mālā ${p(e).malas}`,
        value: String(p(e).count),
      };
    },
  },

  {
    id: "train", name: "Training", short: "Train", path: "/train", icon: "train",
    blurb: "Sessions, sets, volume load and the record.",
    owns: ["set"], nav: true,
    describe(e) {
      const w = n(p(e).weight);
      return {
        title: p(e).name,
        meta: p(e).session ? `Set · ${p(e).session}` : "Set",
        value: w > 0 ? `${w}${p(e).unit} × ${p(e).reps}` : `BW × ${p(e).reps}`,
      };
    },
  },

  {
    id: "meals", name: "Meals", short: "Meals", path: "/meals", icon: "meals",
    blurb: "Two bowls a day, the cooking, and the shopping they add up to.",
    owns: ["meal"], nav: true,
    describe(e) {
      const ate = p(e).status === "ate";
      if (p(e).status === "unset") return null;
      return {
        title: p(e).bowlName ? `${p(e).name} — ${p(e).bowlName}` : p(e).name,
        meta: ate ? p(e).slot : `Dismissed — ${p(e).status}`,
        value: ate && p(e).kcal ? `${p(e).kcal} kcal` : undefined,
        done: ate,
      };
    },
  },

  {
    id: "commonplace", name: "Commonplace", short: "Notes", path: "/commonplace", icon: "notes",
    blurb: "Learnings filed under heads, and indexed to their sources.",
    owns: ["note", "capture"], nav: true,
    describe(e) {
      if (e.kind === "capture") {
        return { title: p(e).text ?? e.raw ?? "", meta: "Capture" };
      }
      return {
        title: p(e).text,
        meta: p(e).headName ? `Note · ${p(e).headName}` : "Note",
      };
    },
  },

  {
    id: "read", name: "Reading", short: "Read", path: "/read", icon: "read",
    blurb: "Several books at once, tracked by the page.",
    owns: ["read"],
    describe(e) {
      const pages = n(p(e).to) - n(p(e).from);
      return {
        title: p(e).name,
        meta: `Read · p. ${p(e).from}–${p(e).to}`,
        value: `${pages} pp`,
      };
    },
  },

  {
    id: "write", name: "Writing", short: "Write", path: "/write", icon: "write",
    blurb: "Notion, to draft, to published. Three states and no more.",
    owns: ["piece"],
    describe(e) {
      return {
        title: p(e).title,
        meta: `Writing · ${p(e).status}`,
        done: p(e).status === "published",
      };
    },
  },

  {
    id: "work", name: "Projects", short: "Work", path: "/work", icon: "work",
    blurb: "Plans broken into steps that can be struck through.",
    owns: ["task"],
    describe(e) {
      if (!p(e).done) return null;
      return { title: p(e).step, meta: p(e).project, done: true };
    },
  },

  {
    id: "measures", name: "Measures", short: "Body", path: "/measures", icon: "measures",
    blurb: "Weight, sleep, pulse — the numbers the rest of it moves.",
    owns: ["measure"],
    describe(e) {
      return { title: p(e).name, meta: "Measure", value: `${p(e).value} ${p(e).unit}` };
    },
  },
];

export const MODULE_BY_ID = new Map(MODULES.map(m => [m.id, m]));

const OWNER = new Map<EventKind, Module>();
for (const m of MODULES) for (const k of m.owns) OWNER.set(k, m);

export const moduleOwning = (kind: EventKind) => OWNER.get(kind);

/** The module whose section of the app this path belongs to. */
export function moduleForPath(path: string): Module | undefined {
  const exact = MODULES.find(m => m.path === path);
  if (exact) return exact;
  return MODULES.find(m => m.path !== "/" && path.startsWith(m.path + "/"));
}

/** Modules whose instruments are not yet cut. Build when the ledger asks. */
export const PLANNED: { name: string; icon: GlyphName; blurb: string }[] = [
  { name: "Horarium", icon: "measures",
    blurb: "Hours kept, and how the rest of the account moves with them." },
  { name: "Vyākaraṇa", icon: "notes",
    blurb: "Sanskrit vocabulary, drilled against what you actually read." },
  { name: "Correspondence", icon: "write",
    blurb: "Letters owed, and how long they have been owed." },
  { name: "Frontier", icon: "today",
    blurb: "One question a day, drawn from wherever the ledger is thin." },
];
