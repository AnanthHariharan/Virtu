import { supabase } from "./supabase";
import type { Entity, VEvent } from "./types";

/**
 * Everything the sync loop asks of the server, and nothing else.
 *
 * The ledger never touches the Supabase client directly. Keeping the
 * contract this narrow is what lets the sync logic be tested against an
 * in-memory server, and what would let a different backend replace this one
 * without the ledger noticing.
 */

type Row<T> = Omit<T, "_sync">;

/** A server row carries columns the local store did not mint. */
export type RemoteEvent = Row<VEvent> & { created_at: string; user_id?: string };
export type RemoteEntity = Row<Entity> & { created_at?: string; user_id?: string };

/**
 * Keyset position in the server's event stream. `created_at` alone is not
 * enough: one upsert of fifty queued events stamps all fifty with the same
 * transaction time, and a page boundary inside that tie would skip rows.
 */
export interface Cursor { at: string; id: string }

export interface Remote {
  configured(): boolean;
  signedIn(): Promise<boolean>;
  pushEvents(rows: Row<VEvent>[]): Promise<void>;
  pushEntities(rows: Row<Entity>[]): Promise<void>;
  fetchEntities(): Promise<RemoteEntity[]>;
  fetchEvents(after: Cursor | null, limit: number): Promise<RemoteEvent[]>;
  onSignIn(fn: () => void): () => void;
}

export const remote: Remote = {
  configured: () => supabase !== null,

  async signedIn() {
    if (!supabase) return false;
    try {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    } catch {
      return false;
    }
  },

  async pushEvents(rows) {
    // client_id carries the idempotency: a double push after a flaky
    // connection collides on (user_id, client_id) and lands once.
    const { error } = await supabase!.from("events").upsert(rows, { onConflict: "user_id,client_id" });
    if (error) throw error;
  },

  async pushEntities(rows) {
    const { error } = await supabase!.from("entities").upsert(rows, { onConflict: "user_id,id" });
    if (error) throw error;
  },

  async fetchEntities() {
    const { data, error } = await supabase!.from("entities").select("*");
    if (error) throw error;
    return (data ?? []) as RemoteEntity[];
  },

  async fetchEvents(after, limit) {
    let q = supabase!.from("events").select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (after) {
      q = q.or(`created_at.gt."${after.at}",and(created_at.eq."${after.at}",id.gt.${after.id})`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RemoteEvent[];
  },

  onSignIn(fn) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_IN") fn();
    });
    return () => data.subscription.unsubscribe();
  },
};
