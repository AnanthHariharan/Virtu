import { z } from "zod";

/**
 * The vocabulary of the ledger, as runtime schemas.
 *
 * These are the single source of truth for what each event kind carries.
 * `Payloads` in `lib/types.ts` is derived from them, so the compile-time
 * check `log()` has always had is unchanged — and anything that arrives as
 * JSON at runtime (an agent, an import, a model's suggestion) can now be
 * checked against exactly the same shape before it is written.
 *
 * Objects are strict: an unknown key is a rejection, not a silently carried
 * column. A payload that is not in this map cannot be written, which is the
 * point.
 *
 * This file is pure — no browser, no database — so the app, a server worker
 * and an MCP server can all import it.
 */

export const SLOTS = ["morning", "midday", "evening", "night"] as const;
export const Slot = z.enum(SLOTS);

const text = z.string();
const count = z.number().finite().nonnegative();

export const SCHEMAS = {
  /** An anushtana observed (or explicitly un-observed — the log is append-only). */
  rite: z.object({ slug: text, name: text, slot: Slot, observed: z.boolean() }).strict(),

  /** A completed mala. */
  japa: z.object({ mantra: text, count, target: count, malas: count }).strict(),

  /** One brahma-yajñam praśna recited. `index` is its place in the cycle. */
  portion: z.object({ slug: text, name: text, index: z.number().int().nonnegative() }).strict(),

  /** One working set. `weight: 0` means bodyweight. */
  set: z.object({
    exercise: text, name: text,
    weight: count, reps: count, unit: z.enum(["kg", "lb"]),
    rpe: z.number().min(1).max(10).optional(),
    session: text.optional(),
  }).strict(),

  /** Physical activity that is not lifting. Minutes are the one constant. */
  activity: z.object({
    activity: text, name: text,
    minutes: count,
    mode: text.optional(),
    distance: count.optional(), distanceUnit: text.optional(),
    note: text.optional(),
  }).strict(),

  /** A sitting taken — with the bowl eaten — or dismissed with a cause. */
  meal: z.object({
    slug: text, name: text, slot: text,
    status: z.union([z.literal("ate"), text]),
    bowl: text.nullable().optional(), bowlName: text.nullable().optional(),
    kcal: count.optional(), protein: count.optional(),
    note: text.optional(),
  }).strict(),

  /**
   * A learning filed under a head, optionally sourced. `files` names the
   * capture it was filed from, by client_id — the link that takes the capture
   * out of the inbox even if its wording was changed on the way in.
   */
  note: z.object({
    text,
    head: text.nullable(), headName: text.nullable(),
    source: text.nullable(), sourceName: text.nullable(),
    files: text.optional(),
  }).strict(),

  /** A reading session, measured in pages. */
  read: z.object({ book: text, name: text, from: count, to: count }).strict(),

  /** A piece of writing entering a new state. */
  piece: z.object({
    title: text, status: z.enum(["idea", "drafting", "published"]), from: text.optional(),
  }).strict(),

  /** A step of a project struck through, or un-struck. */
  task: z.object({ project: text, step: text, done: z.boolean() }).strict(),

  /** A number about the body: weight, sleep, resting heart rate. */
  measure: z.object({ metric: text, name: text, value: z.number().finite(), unit: text }).strict(),

  /** Free text awaiting structure. The only kind with no schema by design. */
  capture: z.object({ text }).strict(),
} as const;

export type Payloads = { [K in keyof typeof SCHEMAS]: z.infer<(typeof SCHEMAS)[K]> };
export type EventKind = keyof Payloads;

export const EVENT_KINDS = Object.keys(SCHEMAS) as EventKind[];

/**
 * What any payload may carry on top of its own shape, to supersede an
 * earlier event. `void` strikes the target out entirely — a set logged by
 * mistake — rather than replacing it with a new value.
 */
export const Correction = z.object({
  corrects: text.optional(),
  void: z.boolean().optional(),
});
export type Correction = z.infer<typeof Correction>;

export function isKind(kind: unknown): kind is EventKind {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(SCHEMAS, kind);
}

export type ParseResult<K extends EventKind> =
  | { ok: true; kind: K; payload: Payloads[K] & Correction }
  | { ok: false; error: string };

/**
 * Check an untrusted payload against its kind. Never throws; the caller
 * decides what a rejection means.
 */
export function parsePayload(kind: unknown, payload: unknown): ParseResult<EventKind> {
  if (!isKind(kind)) return { ok: false, error: `unknown event kind: ${String(kind)}` };
  const r = SCHEMAS[kind].merge(Correction).strict().safeParse(payload);
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues.map(i => `${i.path.join(".") || kind}: ${i.message}`).join("; "),
    };
  }
  return { ok: true, kind, payload: r.data as Payloads[EventKind] & Correction };
}
