/**
 * The table: two bowls a day, one at lunch and one at dinner, drawn from five.
 * Bump VERSION after editing to reseed.
 *
 * Ingredients reference the ITEMS catalogue by slug rather than naming
 * themselves. That indirection is the whole reason the grocery list works: rice
 * appearing in three bowls is one line on the list, not three, and an item's
 * aisle is declared once.
 *
 * Every amount is in grams. Household measures are hints, never the quantity —
 * "⅓ cup" cannot be added up.
 */
export const VERSION = 3;

/* ── the aisles, in the order you walk them ─────────────────────────── */

export const AISLES = [
  { key: "produce", label: "Produce" },
  { key: "grains",  label: "Grains & pasta" },
  { key: "legumes", label: "Beans & legumes" },
  { key: "protein", label: "Protein" },
  { key: "dairy",   label: "Dairy" },
  { key: "pantry",  label: "Pantry & condiments" },
] as const;

export type Aisle = typeof AISLES[number]["key"];

export interface Item {
  name: string;
  aisle: Aisle;
  /**
   * A prepared mix, broken into what you actually buy. The recipe keeps the
   * mix as one line; the grocery list expands it by these shares.
   */
  parts?: { item: string; share: number }[];
  note?: string;
}

export const ITEMS: Record<string, Item> = {
  /* produce */
  "cruciferous-crunch": { name: "Cruciferous crunch", aisle: "produce", note: "bagged slaw mix" },
  cucumber:  { name: "Cucumber", aisle: "produce" },
  tomato:    { name: "Tomato", aisle: "produce" },
  onion:     { name: "Red onion", aisle: "produce" },
  lemon:     { name: "Lemon", aisle: "produce" },
  "bell-pepper": { name: "Bell pepper", aisle: "produce" },
  spinach:   { name: "Spinach", aisle: "produce" },
  arugula:   { name: "Arugula", aisle: "produce" },
  kale:      { name: "Kale", aisle: "produce" },
  broccoli:  { name: "Broccoli", aisle: "produce" },
  "green-beans": { name: "Green beans", aisle: "produce" },
  "peas-carrots": { name: "Peas & carrots", aisle: "produce", note: "frozen is fine" },
  "crimini":  { name: "Crimini mushrooms", aisle: "produce", note: "UV-exposed" },
  "white-mushroom": { name: "White mushrooms", aisle: "produce", note: "UV-exposed" },
  "pico-de-gallo": { name: "Pico de gallo", aisle: "produce" },
  kachumber: {
    name: "Kachumber", aisle: "produce",
    note: "cucumber, tomato, onion, lemon",
    parts: [
      { item: "cucumber", share: 0.375 },
      { item: "tomato",   share: 0.375 },
      { item: "onion",    share: 0.19 },
      { item: "lemon",    share: 0.06 },
    ],
  },

  /* grains */
  "basmati-brown": { name: "Brown basmati rice", aisle: "grains", note: "dry" },
  "ww-macaroni":   { name: "Whole wheat macaroni or farro", aisle: "grains", note: "dry" },
  "ww-noodles":    { name: "Whole wheat noodles", aisle: "grains", note: "dry" },

  /* beans & legumes */
  chickpeas:     { name: "Chickpeas", aisle: "legumes", note: "canned; drain & rinse" },
  "black-beans": { name: "Black beans", aisle: "legumes", note: "canned; drain & rinse" },
  "kidney-beans": { name: "Kidney beans", aisle: "legumes", note: "canned; drain & rinse" },
  lentils:       { name: "Lentils", aisle: "legumes", note: "cooked or canned" },

  /* protein */
  "soya-chunks": { name: "Soya chunks", aisle: "protein", note: "dry" },
  tvp:           { name: "TVP", aisle: "protein", note: "dry" },
  seitan:        { name: "Seitan", aisle: "protein", note: "46 g protein per 100 g" },
  tofu:          { name: "Firm tofu", aisle: "protein", note: "calcium-set" },

  /* dairy */
  feta:       { name: "Feta", aisle: "dairy" },
  gorgonzola: { name: "Gorgonzola", aisle: "dairy" },
  pecorino:   { name: "Pecorino Romano", aisle: "dairy" },
  ghee:       { name: "Ghee", aisle: "dairy", note: "optional, for the Indian bowl" },

  /* pantry */
  evoo:          { name: "Extra virgin olive oil", aisle: "pantry" },
  "avocado-oil": { name: "Avocado oil", aisle: "pantry" },
  kalamata:      { name: "Kalamata olives", aisle: "pantry" },
  pesto:         { name: "Pesto", aisle: "pantry" },
  "simmer-sauce": { name: "Simmer sauce", aisle: "pantry" },
  "soy-sauce":   { name: "Soy sauce", aisle: "pantry", note: "low sodium" },
  "rw-vinegar":  { name: "Red wine vinegar", aisle: "pantry", note: "for acidity on the Spanish bowl" },
};

/* ── the bowls ──────────────────────────────────────────────────────── */

export interface Ingredient {
  item: keyof typeof ITEMS | string;
  /** Grams. The only quantity that can be added up. */
  g: number;
  /** A household measure, shown beside the grams. Never used in arithmetic. */
  hint?: string;
}

export interface Bowl {
  slug: string;
  name: string;
  kcal: number;
  protein: number;
  ingredients: Ingredient[];
  note?: string;
}

export const BOWLS: Bowl[] = [
  {
    slug: "greek", name: "Greek", kcal: 677, protein: 33,
    ingredients: [
      { item: "basmati-brown", g: 60, hint: "⅓ cup" },
      { item: "chickpeas", g: 110 },
      { item: "cruciferous-crunch", g: 60, hint: "2 cups" },
      { item: "cucumber", g: 50 },
      { item: "tomato", g: 60 },
      { item: "bell-pepper", g: 50 },
      { item: "kalamata", g: 15, hint: "5 olives" },
      { item: "soya-chunks", g: 35 },
      { item: "feta", g: 25 },
      { item: "evoo", g: 9, hint: "2 tsp" },
    ],
  },
  {
    slug: "spanish", name: "Spanish", kcal: 666, protein: 33,
    note: "Olives and dressing removed. Red wine vinegar or lime for the acidity they were carrying.",
    ingredients: [
      { item: "basmati-brown", g: 70 },
      { item: "black-beans", g: 110 },
      { item: "spinach", g: 60, hint: "2 cups" },
      { item: "pico-de-gallo", g: 60, hint: "¼ cup" },
      { item: "bell-pepper", g: 50 },
      { item: "tvp", g: 32 },
      { item: "gorgonzola", g: 20 },
      { item: "evoo", g: 9, hint: "2 tsp" },
      { item: "rw-vinegar", g: 5, hint: "1 tsp, or lime" },
    ],
  },
  {
    slug: "italian", name: "Italian", kcal: 672, protein: 38,
    note: "No EVOO — the pesto is already mostly olive oil. Seitan is 46 g protein per 100 g, which is why 22 g carries this bowl.",
    ingredients: [
      { item: "ww-macaroni", g: 95 },
      { item: "lentils", g: 70 },
      { item: "arugula", g: 40 },
      { item: "broccoli", g: 80 },
      { item: "crimini", g: 70 },
      { item: "pesto", g: 24, hint: "1½ tbsp" },
      { item: "seitan", g: 22 },
      { item: "pecorino", g: 12 },
    ],
  },
  {
    slug: "indian", name: "Indian", kcal: 674, protein: 36,
    note: "The lowest-fat bowl at 56 g. A teaspoon of ghee brings it to about 65 g — the traditional fat here, and what carries the spinach's fat-soluble vitamins.",
    ingredients: [
      { item: "basmati-brown", g: 65 },
      { item: "kidney-beans", g: 110 },
      { item: "spinach", g: 60 },
      { item: "peas-carrots", g: 100 },
      { item: "tofu", g: 100, hint: "or 115 g low-fat paneer" },
      { item: "simmer-sauce", g: 60, hint: "¼ cup" },
      { item: "kachumber", g: 80 },
      { item: "ghee", g: 4, hint: "1 tsp, optional" },
    ],
  },
  {
    slug: "chinese", name: "Chinese", kcal: 645, protein: 39,
    ingredients: [
      { item: "ww-noodles", g: 75 },
      { item: "lentils", g: 70 },
      { item: "kale", g: 60 },
      { item: "tofu", g: 100 },
      { item: "bell-pepper", g: 50 },
      { item: "green-beans", g: 70 },
      { item: "white-mushroom", g: 60 },
      { item: "avocado-oil", g: 9, hint: "2 tsp" },
      { item: "soy-sauce", g: 15, hint: "1 tbsp" },
    ],
  },
];

export const bowlBySlug = (slug: string) => BOWLS.find(b => b.slug === slug);

/* ── the two sittings ───────────────────────────────────────────────── */

export interface Sitting { slug: string; name: string; time: string; label: string }

export const SITTINGS: Sitting[] = [
  { slug: "lunch",  name: "Lunch",  time: "13:00", label: "First bowl" },
  { slug: "dinner", name: "Dinner", time: "19:30", label: "Second bowl" },
];

/** Offered when a sitting is dismissed. The last is free text. */
export const DISMISSALS = ["Ate out", "Travelling", "Fasting", "Unwell", "Not hungry", "Other"];

/* ── the grocery list ───────────────────────────────────────────────── */

export interface GroceryLine {
  item: string;
  name: string;
  aisle: Aisle;
  grams: number;
  note?: string;
  /** Which bowls put it on the list. */
  from: string[];
}

/**
 * Aggregate the shopping for a set of bowl counts.
 *
 * Prepared mixes are expanded into their parts, so "kachumber" leaves the
 * recipe intact and arrives at the shop as cucumber, tomato, onion and a
 * lemon — which is what you can actually put in a basket.
 */
export function groceryList(counts: Record<string, number>): GroceryLine[] {
  const acc = new Map<string, GroceryLine>();

  const add = (itemKey: string, grams: number, bowl: string) => {
    const def = ITEMS[itemKey];
    if (!def || grams <= 0) return;

    if (def.parts) {
      for (const p of def.parts) add(p.item, grams * p.share, bowl);
      return;
    }
    const cur = acc.get(itemKey);
    if (cur) {
      cur.grams += grams;
      if (!cur.from.includes(bowl)) cur.from.push(bowl);
    } else {
      acc.set(itemKey, {
        item: itemKey, name: def.name, aisle: def.aisle,
        grams, note: def.note, from: [bowl],
      });
    }
  };

  for (const bowl of BOWLS) {
    const n = counts[bowl.slug] ?? 0;
    if (n <= 0) continue;
    for (const ing of bowl.ingredients) add(ing.item, ing.g * n, bowl.name);
  }

  const order = AISLES.map(a => a.key);
  return [...acc.values()].sort(
    (a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name)
  );
}

/** Grams read badly past a kilo, and a shop does not sell 1,382 g of rice. */
export function amount(grams: number): string {
  const g = Math.round(grams);
  return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${g} g`;
}
