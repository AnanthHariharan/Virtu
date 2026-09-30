import type { EventKind, Payloads, VEvent } from "@/lib/types";

/**
 * One valid payload for every kind. Typed as the full map, so adding a kind
 * to the schema without adding a sample here is a compile error — which is
 * what keeps the schema and registry tests covering every kind.
 */
export const SAMPLES: { [K in EventKind]: Payloads[K] } = {
  rite: { slug: "pratah-sandhya", name: "Prataḥ sandhyāvandanam", slot: "morning", observed: true },
  japa: { mantra: "Gāyatrī", count: 108, target: 108, malas: 1 },
  portion: { slug: "sri-rudra", name: "Śrī Rudra Praśna", index: 1 },
  set: { exercise: "barbell-squat", name: "Barbell squat", weight: 65, reps: 8, unit: "lb", session: "Push" },
  activity: { activity: "running", name: "Running", minutes: 30, mode: "Easy", distance: 3.1, distanceUnit: "mi" },
  meal: { slug: "lunch", name: "Lunch", slot: "midday", status: "ate", bowl: "indian", bowlName: "Indian", kcal: 650, protein: 40 },
  note: { text: "Structure is the ornament.", head: "craft", headName: "Craft", source: null, sourceName: null },
  read: { book: "gita", name: "Bhagavad Gītā", from: 10, to: 24 },
  piece: { title: "On ledgers", status: "drafting" },
  task: { project: "Virtu", step: "Ship part one", done: true },
  measure: { metric: "weight", name: "Body weight", value: 71.2, unit: "kg" },
  capture: { text: "bench felt heavy today" },
  judgment: {
    target: "c-1", task: "triage", model: "jev-1.13.0",
    answers: { kind: { type: "choice", choice: "note", confidence: 0.9, probabilities: { note: 0.95, task: 0.05 } } },
    proposal: {
      kind: "note", confidence: 0.9, complete: true, missing: [],
      payload: { text: "x", head: "craft", headName: "Craft", source: null, sourceName: null, files: "c-1" },
    },
    action: "auto",
  },
  verdict: { judgment: "c-2", target: "c-1", accepted: true, wrote: "c-3" },
};

let n = 0;

/** A ledger row, with sensible defaults, for tests that need whole events. */
export function ev<K extends EventKind>(
  kind: K, payload: VEvent<K>["payload"], over: Partial<VEvent<K>> = {}
): VEvent<K> {
  n++;
  const at = over.occurred_at ?? new Date(Date.UTC(2026, 8, 1, 12, 0, n)).toISOString();
  return {
    id: `id-${n}`,
    client_id: `c-${n}`,
    kind,
    occurred_at: at,
    recorded_at: over.recorded_at ?? at,
    local_date: "2026-09-01",
    raw: null,
    payload,
    status: "confirmed",
    source: "phone",
    ...over,
  };
}
