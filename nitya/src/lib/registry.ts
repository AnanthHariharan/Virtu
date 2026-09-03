import type { EventKind } from "./types";

/**
 * The Cabinet.
 *
 * Sub-apps are DATA, not hardcoded routes. Each declares the event kinds it
 * owns and nothing more, which is what lets the Daybook render entries from
 * an instrument that has since been shut, and lets a new instrument inherit
 * the same paper, marks and rules without touching anything else.
 *
 * Adding one is three steps: a row here, a route folder, a `case` in the
 * Daybook's line renderer. Nothing else in the app needs to know.
 *
 * Sigils are the seven classical planets, which governed the days of the
 * week in every Renaissance almanac, plus the manicule — the pointing hand a
 * reader drew in the margin beside a passage worth keeping.
 */

export interface AppDef {
  id: string;
  route: string;
  sigil: string;
  name: string;
  owns: EventKind[];
  ownsLabel: string;
  blurb: string;
  /** cannot be shut */
  fixed?: boolean;
  /** shown in the foot navigation */
  inFoot?: boolean;
}

export const APPS: AppDef[] = [
  { id: "day", route: "/", sigil: "☉", name: "Daybook", fixed: true, inFoot: true,
    owns: [], ownsLabel: "every kind",
    blurb: "The whole day on one page, whatever instrument entered it." },

  { id: "rites", route: "/rites", sigil: "☾", name: "Anuṣṭhāna", inFoot: true,
    owns: ["rite", "japa", "portion"], ownsLabel: "rite · japa · portion",
    blurb: "Nitya-karma across the three vessels of the day." },

  { id: "train", route: "/train", sigil: "♂", name: "Training", inFoot: true,
    owns: ["workout_set"], ownsLabel: "set · load · record",
    blurb: "The week's routines, sets, volume, and the record." },

  { id: "ahara", route: "/ahara", sigil: "♀", name: "Āhāra",
    owns: ["meal"], ownsLabel: "meal · dismissal",
    blurb: "A planned menu, confirmed or dismissed with cause." },

  { id: "commonplace", route: "/commonplace", sigil: "☞", name: "Commonplace", inFoot: true,
    owns: ["learning"], ownsLabel: "learning · locus",
    blurb: "Learnings filed under heads, in the old manner." },

  { id: "reading", route: "/reading", sigil: "♃", name: "Reading", inFoot: true,
    owns: ["reading"], ownsLabel: "book · session",
    blurb: "Several books at once, tracked by the page." },

  { id: "writing", route: "/writing", sigil: "☿", name: "Writing",
    owns: ["writing"], ownsLabel: "idea · piece",
    blurb: "From notion, to drafting, to published." },

  { id: "projects", route: "/projects", sigil: "♄", name: "Projects",
    owns: ["project_step"], ownsLabel: "project · step",
    blurb: "Plans broken into pieces that can be struck through." },
];

/** Cut these when the ledger asks for them, not before. */
export const FUTURE_APPS: Omit<AppDef, "id" | "route" | "owns">[] = [
  { sigil: "☉", name: "Horarium", ownsLabel: "sleep · rising",
    blurb: "Hours kept, and how the day's account moves with them." },
  { sigil: "✎", name: "Vyākaraṇa", ownsLabel: "term · declension",
    blurb: "Sanskrit vocabulary, drilled against what you actually read." },
  { sigil: "✉", name: "Correspondence", ownsLabel: "letter · reply",
    blurb: "Letters owed, and how long they have been owed." },
  { sigil: "☍", name: "Frontier", ownsLabel: "provocation",
    blurb: "One question a day, drawn from where the ledger is thin." },
];

export const CABINET = new Map(APPS.map(a => [a.id, a]));

/** Routes that belong to an instrument but carry their own running head. */
const SUB_ROUTES: Record<string, { sigil: string; name: string }> = {
  "/japa":    { sigil: "☾", name: "Japa" },
  "/cabinet": { sigil: "❦", name: "The Cabinet" },
};

export function byRoute(path: string): { sigil: string; name: string } | undefined {
  if (SUB_ROUTES[path]) return SUB_ROUTES[path];
  const exact = APPS.find(a => a.route === path);
  if (exact) return exact;
  return APPS.find(a => a.route !== "/" && path.startsWith(a.route));
}
export const appOwning = (kind: EventKind) => APPS.find(a => a.owns.includes(kind));
