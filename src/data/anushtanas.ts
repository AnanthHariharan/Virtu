import type { Slot } from "@/lib/types";

/**
 * Nitya-karma. Bump VERSION after editing to reseed.
 *
 * `japa: true` sends you to the counter when the rite is marked observed.
 * `portion: true` marks a rite whose canon is recited in daily portions —
 * coverage is exactly computable once the corpus is seeded, and deliberately
 * is not seeded here: it differs by shakha and sampradaya and must come from
 * your parampara rather than from a model.
 */
export const VERSION = 1;

export interface Anushtana {
  slug: string;
  name: string;
  slot: Slot;
  japa?: boolean;
  portion?: boolean;
  note?: string;
}

export const ANUSHTANAS: Anushtana[] = [
  { slug: "pratah-sandhya", name: "Prataḥ sandhyāvandanam", slot: "morning", japa: true,
    note: "Gāyatrī japa" },
  { slug: "samidadana-am",  name: "Samidādāna mantra-pāṭham", slot: "morning" },
  { slug: "brahma-yajnam",  name: "Brahma-yajñam", slot: "morning", portion: true,
    note: "Daily portion" },
  { slug: "madhyahnika",    name: "Mādhyāhnika", slot: "midday" },
  { slug: "sayam-sandhya",  name: "Sāyaṃ sandhyāvandanam", slot: "evening", japa: true,
    note: "Gāyatrī japa" },
  { slug: "samidadana-pm",  name: "Samidādānam", slot: "evening" },
];
