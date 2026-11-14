import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "../env";

/** User-scoped client (RLS enforced). */
export async function supabaseServer() {
  const env = publicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* server component */ } },
    },
  });
}

/** Service-role client. SERVER ONLY. Bypasses RLS: callers must scope by verified user id. */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role not configured");
  return createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser(); // validates JWT with Supabase Auth
  return data.user ? { sb, user: data.user } : null;
}
