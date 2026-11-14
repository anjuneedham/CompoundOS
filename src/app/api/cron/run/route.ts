import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runPaperCycle, runRiskMonitor, runScheduledResearch } from "@/server/paper";
import { generateReport } from "@/server/ai-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET; if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Db = ReturnType<typeof supabaseAdmin>;
const JOBS: Record<string, (db: Db, userId: string) => Promise<string[]>> = {
  risk_monitor: (db, u) => runRiskMonitor(db, u),
  paper_cycle: (db, u) => runPaperCycle(db, u),
  ai_research: (db, u) => runScheduledResearch(db, u),
  daily_report: async (db, u) => {
    const now = new Date(), out: string[] = [];
    const periods = ["daily" as const, ...(now.getUTCDay() === 1 ? ["weekly" as const] : []), ...(now.getUTCDate() === 1 ? ["monthly" as const] : [])];
    for (const p of periods) { const r = await generateReport(db, u, p); out.push(`${p} report${r.aiError ? ` (no AI narrative: ${r.aiError})` : ""}`); }
    return out;
  },
};
// Risk monitor first so a breach halts trading before new entries are considered.
const ORDER = ["risk_monitor", "paper_cycle", "ai_research", "daily_report"];

/** Invoked by Supabase pg_cron (pg_net) or Vercel Cron. Runs each user's due jobs. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: jobs } = await db.from("scheduled_jobs").select("user_id,job,interval_minutes,last_run_at").eq("enabled", true);
  const due = (jobs ?? []).filter((j) => !j.last_run_at || Date.now() - new Date(j.last_run_at).getTime() >= j.interval_minutes * 60_000 - 30_000)
    .sort((a, b) => ORDER.indexOf(a.job) - ORDER.indexOf(b.job));
  const results: { user: string; job: string; ok: boolean; log?: string[] }[] = [];
  for (const j of due) {
    const fn = JOBS[j.job]; if (!fn) continue;
    const { data: claimed } = await db.rpc("claim_job", { p_user: j.user_id, p_job: j.job, p_lock_seconds: 120 });
    if (!claimed) continue;
    const mark = (status: string) => db.from("scheduled_jobs").update({ last_run_at: new Date().toISOString(), last_status: status.slice(0, 300), locked_until: null }).eq("user_id", j.user_id).eq("job", j.job);
    try {
      const log = await fn(db, j.user_id);
      await mark("ok"); results.push({ user: j.user_id.slice(0, 8), job: j.job, ok: true, log });
    } catch (e) {
      await mark(`error: ${(e as Error).message}`);
      await db.from("system_events").insert({ user_id: j.user_id, kind: "job_failed", detail: { job: j.job, error: (e as Error).message } });
      results.push({ user: j.user_id.slice(0, 8), job: j.job, ok: false });
    }
  }
  await db.from("system_health").insert({ component: "cron", status: results.some((r) => !r.ok) ? "degraded" : "ok", detail: { ran: results.length } });
  return NextResponse.json({ ran: results.length, results });
}
export const GET = POST;
