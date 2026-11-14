import { z } from "zod";

/**
 * Supabase keys: supports the current key types (publishable `sb_publishable_…`,
 * secret `sb_secret_…`) and falls back to legacy anon / service_role JWT keys.
 */
export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublicKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Server only. Never expose. */
export const supabaseSecretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const serverSchema = z.object({
  supabaseUrl: z.string().url(),
  supabasePublicKey: z.string().min(20),
  supabaseSecretKey: z.string().min(20).refine((k) => !k.startsWith("sb_publishable_"), "secret key slot contains a publishable key"),
  cronSecret: z.string().min(16),
});

export function publicEnv() {
  const url = supabaseUrl(), key = supabasePublicKey();
  if (!url || !key) return null;
  if (key.startsWith("sb_secret_")) throw new Error("A Supabase SECRET key was placed in a NEXT_PUBLIC_ variable. Use the publishable key there.");
  return { url, key };
}
/** Server-only. Returns names of missing settings (never values). */
export function serverEnv() {
  const r = serverSchema.safeParse({ supabaseUrl: supabaseUrl(), supabasePublicKey: supabasePublicKey(), supabaseSecretKey: supabaseSecretKey(), cronSecret: process.env.CRON_SECRET });
  const names: Record<string, string> = { supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL", supabasePublicKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabaseSecretKey: "SUPABASE_SECRET_KEY", cronSecret: "CRON_SECRET" };
  return r.success ? { ok: true as const } : { ok: false as const, missing: r.error.issues.map((i) => names[String(i.path[0])] ?? String(i.path[0])) };
}
export const isConfigured = () => publicEnv() !== null;
