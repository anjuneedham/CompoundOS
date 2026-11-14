import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});
const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
});

export function publicEnv() {
  const r = publicSchema.safeParse({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
  return r.success ? r.data : null;
}
/** Server-only. Returns null + missing keys if not configured (app shows a setup screen). */
export function serverEnv() {
  const r = serverSchema.safeParse(process.env);
  return r.success ? { ok: true as const, env: r.data } : { ok: false as const, missing: r.error.issues.map((i) => i.path.join(".")) };
}
export const isConfigured = () => publicEnv() !== null;
