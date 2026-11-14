import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, supabaseSecretKey, supabaseUrl } from "../env";

/** User-scoped client (RLS enforced). */
export async function supabaseServer() {
  const env = publicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* server component */ } },
    },
  });
}

/** Secret-key (or legacy service_role) client. SERVER ONLY. Bypasses RLS: callers must scope by verified user id. */
export function supabaseAdmin() {
  const url = supabaseUrl(), key = supabaseSecretKey();
  if (!url || !key) throw new Error("Supabase secret key not configured");
  return createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser(); // validates JWT with Supabase Auth
  return data.user ? { sb, user: data.user } : null;
}
