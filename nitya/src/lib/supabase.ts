import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when the environment is not configured. Every caller must handle that:
 * the app is fully usable offline against IndexedDB alone, and refusing to
 * render without a database would defeat the point of local-first.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const hasRemote = () => supabase !== null;
