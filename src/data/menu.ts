/**
 * The standing menu. Bump VERSION after editing to reseed.
 *
 * A meal is a plan, not a log. Confirming one records that you ate it;
 * dismissing one asks for a cause, and the cause is the record. A blank skip
 * tells you nothing in six months. "Travelling" three Fridays running tells
 * you a great deal.
 */
export const VERSION = 1;

export interface Meal {
  slug: string;
  name: string;
  /** 24h, for ordering and for the "due now" test. */
  time: string;
  label: string;
  items?: string[];
}

export const MENU: Meal[] = [
  { slug: "first",     name: "On rising",  time: "06:30", label: "Before the rites",
    items: ["Warm water", "Soaked almonds"] },
  { slug: "breakfast", name: "Breakfast",  time: "09:00", label: "After the rites",
    items: ["Idli", "Sāmbār", "Chutney"] },
  { slug: "lunch",     name: "Lunch",      time: "13:00", label: "The main meal",
    items: ["Rice", "Sāmbār", "Poriyal", "Curd"] },
  { slug: "evening",   name: "Evening",    time: "16:30", label: "Light",
    items: ["Fruit", "Nuts"] },
  { slug: "dinner",    name: "Dinner",     time: "19:30", label: "Early and small",
    items: ["Chapati", "Sabzi", "Dāl"] },
];

/** Offered when a meal is dismissed. The last is free text. */
export const DISMISSALS = ["Ate out", "Travelling", "Fasting", "Unwell", "Not hungry", "Other"];
