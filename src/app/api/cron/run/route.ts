import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runPaperCycle } from "@/server/paper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET; if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Invoked by Supabase pg_cron (pg_net) or Vercel Cron. Runs due paper cycles. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: jobs } = await db.from("scheduled_jobs").select("user_id,job,interval_minutes,last_run_at").eq("enabled", true).eq("job", "paper_cycle");
  const results: { user: string; ok: boolean; log?: string[]; error?: string }[] = [];
  for (const j of jobs ?? []) {
    const due = !j.last_run_at || Date.now() - new Date(j.last_run_at).getTime() >= j.interval_minutes * 60_000 - 30_000;
    if (!due) continue;
    const { data: claimed } = await db.rpc("claim_job", { p_user: j.user_id, p_job: "paper_cycle", p_lock_seconds: 120 });
    if (!claimed) continue;
    try {
      const log = await runPaperCycle(db, j.user_id);
      await db.from("scheduled_jobs").update({ last_run_at: new Date().toISOString(), last_status: "ok", locked_until: null }).eq("user_id", j.user_id).eq("job", "paper_cycle");
      results.push({ user: j.user_id.slice(0, 8), ok: true, log });
    } catch (e) {
      await db.from("scheduled_jobs").update({ last_run_at: new Date().toISOString(), last_status: `error: ${(e as Error).message}`.slice(0, 300), locked_until: null }).eq("user_id", j.user_id).eq("job", "paper_cycle");
      await db.from("system_events").insert({ user_id: j.user_id, kind: "job_failed", detail: { job: "paper_cycle", error: (e as Error).message } });
      results.push({ user: j.user_id.slice(0, 8), ok: false, error: "failed" });
    }
  }
  await db.from("system_health").insert({ component: "cron", status: "ok", detail: { ran: results.length } });
  return NextResponse.json({ ran: results.length, results });
}
export const GET = POST; // Vercel Cron issues GET with the Authorization header
