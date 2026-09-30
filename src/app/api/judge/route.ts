import { createClient } from "@supabase/supabase-js";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { handleJudge } from "@/lib/jev-server";

/**
 * POST /api/judge — one Jev request for one task. See lib/jev-server.
 *
 * Who may spend the key: with Supabase configured, only a signed-in user
 * (the client sends its session token). Without it, only in development, or
 * where JEV_ALLOW_ANON=1 is set deliberately — a deployed URL with the key
 * behind it and no gate is an open tap.
 */
async function authorize(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return false;
    const { data, error } = await createClient(url, key).auth.getUser(token);
    return !error && !!data.user;
  }
  return process.env.NODE_ENV !== "production" || process.env.JEV_ALLOW_ANON === "1";
}

export async function POST(req: Request) {
  return handleJudge(req, {
    authorize,
    client: () => new TypeSafeClient({ timeout: 10_000 }),
  });
}
