export type Slot = "morning" | "afternoon" | "evening";

export type EventKind =
  | "rite"            // { rite_slug, slot, observed }
  | "japa"            // { mantra, count, target, malas }
  | "portion"         // { portion_slug }            — brahma-yajñam coverage
  | "workout_set"     // { exercise_slug, weight, reps, rpe? }
  | "meal"            // { meal_slug, status: 'ate' | reason }
  | "learning"        // { text, locus_slug, source_entity? }
  | "reading"         // { book_slug, from_page, to_page }
  | "writing"         // { idea_slug, status, title }
  | "project_step"    // { project_slug, step, done }
  | "note";           // { text }  — free text, awaiting extraction

export type EntityKind =
  | "book" | "exercise" | "rite" | "locus" | "project"
  | "idea" | "meal_slot" | "portion" | "concept";

export type SyncStatus = "pending" | "synced" | "failed";

export interface NEvent {
  id: string;
  client_id: string;
  kind: EventKind;
  occurred_at: string;   // ISO
  recorded_at: string;   // ISO
  local_date: string;    // YYYY-MM-DD in the user's zone
  raw: string | null;
  payload: Record<string, unknown> | null;
  status: "raw" | "extracted" | "confirmed" | "failed";
  source: "phone" | "desktop" | "agent" | "import";
  /** local-only: not a column */
  _sync?: SyncStatus;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  aliases: string[];
  meta: Record<string, any>;
  state: Record<string, any>;
  ord: number | null;
  archived_at: string | null;
  _sync?: SyncStatus;
}

export interface AppRow {
  id: string;
  enabled: boolean;
  ord: number;
  pinned: boolean;
  settings: Record<string, unknown>;
}
