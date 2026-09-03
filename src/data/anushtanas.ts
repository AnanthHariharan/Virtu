import type { Slot } from "@/lib/types";

/**
 * Nitya-karma. Bump VERSION after editing to reseed.
 *
 * `japa: true` sends you to the counter when the rite is marked observed.
 * `portion: true` marks the rite recited in daily portions — see PORTIONS.
 */
export const VERSION = 2;

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
    note: "One praśna a day" },
  { slug: "madhyahnika",    name: "Mādhyāhnika", slot: "midday" },
  { slug: "sayam-sandhya",  name: "Sāyaṃ sandhyāvandanam", slot: "evening", japa: true,
    note: "Gāyatrī japa" },
  { slug: "samidadana-pm",  name: "Samidādānam", slot: "evening" },
];

/**
 * The brahma-yajñam praśnas, portioned out one a day.
 *
 * The order here IS the cycle, and it is load-bearing: the praśna due today
 * is the one after the last portion recorded, wrapping at the end. That rule
 * is what makes a missed day cost you a day rather than a praśna — you resume
 * where you left off instead of where the calendar thinks you should be.
 *
 * Because the corpus is finite and ordered, coverage is exactly computable.
 * It is the one measure in the whole application with hard ground truth.
 */
export interface Portion { slug: string; name: string }

export const PORTIONS: Portion[] = [
  { slug: "prarthana-ganapati", name: "Prārthanā & Gaṇapati Atharvaśīrṣa" },
  { slug: "sri-rudra",          name: "Śrī Rudra Praśna" },
  { slug: "camaka",             name: "Camaka Praśna" },
  { slug: "purusa-narayana",    name: "Puruṣa Sūkta & Nārāyaṇa Sūkta" },
  { slug: "vishnu-sri-bhu-nila", name: "Viṣṇu, Śrī, Bhū & Nīlā Sūkta" },
  { slug: "durga-medha-bhagya", name: "Durgā, Medhā & Bhāgya Sūkta" },
  { slug: "navagraha",          name: "Navagraha Sūkta" },
  { slug: "taitt-siksha",       name: "Taittirīyopaniṣad — Śīkṣāvallī" },
  { slug: "taitt-ananda",       name: "Taittirīyopaniṣad — Ānandavallī" },
  { slug: "taitt-bhrgu",        name: "Taittirīyopaniṣad — Bhṛguvallī" },
  { slug: "acchidram",          name: "Acchidram" },
  { slug: "ashvamedham-shanti", name: "Aśvamedham & Śānti Pañcakam" },
];

/** The praśna due after `last`. Wraps; with nothing recorded, begins at the first. */
export function nextPortion(last?: string): Portion {
  if (!last) return PORTIONS[0];
  const i = PORTIONS.findIndex(p => p.slug === last);
  return PORTIONS[i < 0 ? 0 : (i + 1) % PORTIONS.length];
}
