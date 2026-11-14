import { NextResponse } from "next/server";
import { serverEnv, supabaseSecretKey } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() {
  const e = serverEnv();
  // Never reveal values; only whether config is present.
  return NextResponse.json({ status: e.ok ? "ok" : "degraded", supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKeyType: supabaseSecretKey()?.startsWith("sb_secret_") ? "secret" : supabaseSecretKey() ? "legacy_service_role" : "missing", ai: !!process.env.ANTHROPIC_API_KEY, liveTrading: false, missing: e.ok ? [] : e.missing, time: new Date().toISOString() });
}
