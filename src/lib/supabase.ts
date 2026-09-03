import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when the environment is not configured, and every caller must handle
 * that. Virtu is fully usable against IndexedDB alone; refusing to render
 * without a database would defeat the whole point of local-first.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

export const hasRemote = () => supabase !== null;
