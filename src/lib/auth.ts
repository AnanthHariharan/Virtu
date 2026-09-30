"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * One user, one book — but the server still needs to know whose book it is.
 * Row Level Security scopes every row to auth.uid(), and without a session
 * that is null and every push is refused. A magic link is the whole of the
 * sign-in: no password to keep, and the link lands back on Settings.
 */

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No database is configured." };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/settings` },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** The signed-in email, null when signed out, undefined while unknown. */
export function useAccount(): string | null | undefined {
  const [email, setEmail] = useState<string | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return email;
}
