"use client";
import { useState, useTransition } from "react";
import { setMode, updateSettings, resetPaperAccount } from "@/server/actions";

export type Job = { job: "risk_monitor" | "paper_cycle" | "ai_research" | "daily_report"; enabled: boolean; interval_minutes: number };
const JOB_INFO: Record<Job["job"], { label: string; help: string; min: number }> = {
  risk_monitor: { label: "Risk monitor", help: "Marks positions, processes stops/targets, enforces hard limits. Never opens trades. No AI cost.", min: 15 },
  paper_cycle: { label: "Paper trading cycle", help: "Runs active strategies and executes approved signals on the paper account. No AI cost.", min: 15 },
  ai_research: { label: "AI market research", help: "Claude assesses active strategies' instruments and may propose a trade (paper mode sends it to the risk engine). Uses AI tokens.", min: 60 },
  daily_report: { label: "Performance reports", help: "Daily report; weekly on Mondays, monthly on the 1st (UTC). AI narrative if configured.", min: 1440 },
};

export function SettingsForm({ mode, s, jobs: initialJobs }: { mode: string; s: { emergency_policy: string; ai_daily_token_budget: number }; jobs: Job[] }) {
  const [v, setV] = useState(s); const [jobs, setJobs] = useState(initialJobs);
  const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  const act = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } });
  const setJob = (i: number, patch: Partial<Job>) => setJobs(jobs.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  return (
    <div className="space-y-6">
      <div><div className="label mb-2">Operating mode</div>
        <div className="flex flex-wrap gap-2">
          {["research", "paper"].map((m) => <button key={m} className={m === mode ? "btn-primary" : "btn"} disabled={pending} onClick={() => act(() => setMode(m), `Mode set to ${m}`)}>{m === "research" ? "Research (no orders)" : "Paper trading"}</button>)}
          <button className="btn" disabled title="Live trading requires a verified broker integration, completed paper validation and a separate authorization release.">Live (unavailable)</button>
        </div></div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(() => updateSettings({ ...v, jobs }), "Settings saved"); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-dim">Emergency position policy<select className="input" value={v.emergency_policy} onChange={(e) => setV({ ...v, emergency_policy: e.target.value })}><option value="halt_only">Halt new orders only (keep positions)</option><option value="close_all">Halt and close all positions</option><option value="close_losing">Halt and close losing positions</option></select></label>
          <label className="text-xs text-dim">AI daily token budget<input className="input num" type="number" min={0} value={v.ai_daily_token_budget} onChange={(e) => setV({ ...v, ai_daily_token_budget: Number(e.target.value) })} /></label>
        </div>
        <div><div className="label mb-2">Schedules</div>
          <div className="space-y-2">{jobs.map((j, i) => { const info = JOB_INFO[j.job]; return (
            <div key={j.job} className="grid items-center gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_auto_8rem]">
              <div><div className="text-sm font-medium">{info.label}</div><div className="text-xs text-dim">{info.help}</div></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={j.enabled} onChange={(e) => setJob(i, { enabled: e.target.checked })} /> Enabled</label>
              <label className="text-xs text-dim">Every (min)<input className="input num" type="number" min={info.min} max={10080} value={j.interval_minutes} onChange={(e) => setJob(i, { interval_minutes: Math.max(info.min, Number(e.target.value)) })} /></label>
            </div>); })}</div>
          <p className="mt-2 text-xs text-dim">Schedules run when the external scheduler (Supabase pg_cron) calls the app; see DEPLOYMENT.md. Risk monitor always runs before trading jobs.</p></div>
        <button className="btn-primary w-full" disabled={pending}>Save settings</button>
      </form>
      <div><div className="label mb-2">Danger zone</div><button className="btn-danger" disabled={pending} onClick={() => { const c = window.prompt('Reset the paper account to its starting balance? Type "RESET".'); if (c) act(() => resetPaperAccount(c), "Paper account reset"); }}>Reset paper account</button></div>
      {msg && <p className="text-sm text-dim">{msg}</p>}
    </div>
  );
}
