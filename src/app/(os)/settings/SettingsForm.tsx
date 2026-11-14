"use client";
import { useState, useTransition } from "react";
import { setMode, updateSettings, resetPaperAccount } from "@/server/actions";

export function SettingsForm({ mode, s }: { mode: string; s: { emergency_policy: string; ai_daily_token_budget: number; automation: boolean; interval_minutes: number } }) {
  const [v, setV] = useState(s); const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  const act = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } });
  return (
    <div className="space-y-6">
      <div><div className="label mb-2">Operating mode</div>
        <div className="flex flex-wrap gap-2">
          {["research", "paper"].map((m) => <button key={m} className={m === mode ? "btn-primary" : "btn"} disabled={pending} onClick={() => act(() => setMode(m), `Mode set to ${m}`)}>{m === "research" ? "Research (no orders)" : "Paper trading"}</button>)}
          <button className="btn" disabled title="Live trading requires a verified broker integration, completed paper validation and a separate authorization release.">Live (unavailable)</button>
        </div></div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(() => updateSettings(v), "Settings saved"); }}>
        <label className="text-xs text-dim">Emergency position policy<select className="input" value={v.emergency_policy} onChange={(e) => setV({ ...v, emergency_policy: e.target.value })}><option value="halt_only">Halt new orders only (keep positions)</option><option value="close_all">Halt and close all positions</option><option value="close_losing">Halt and close losing positions</option></select></label>
        <label className="text-xs text-dim">AI daily token budget<input className="input num" type="number" min={0} value={v.ai_daily_token_budget} onChange={(e) => setV({ ...v, ai_daily_token_budget: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.automation} onChange={(e) => setV({ ...v, automation: e.target.checked })} /> Autonomous paper cycles (scheduled)</label>
        <label className="text-xs text-dim">Cycle interval (minutes)<input className="input num" type="number" min={15} max={1440} value={v.interval_minutes} onChange={(e) => setV({ ...v, interval_minutes: Number(e.target.value) })} /></label>
        <button className="btn-primary sm:col-span-2" disabled={pending}>Save settings</button>
      </form>
      <div><div className="label mb-2">Danger zone</div><button className="btn-danger" disabled={pending} onClick={() => { const c = window.prompt('Reset the paper account to its starting balance? Type "RESET".'); if (c) act(() => resetPaperAccount(c), "Paper account reset"); }}>Reset paper account</button></div>
      {msg && <p className="text-sm text-dim">{msg}</p>}
    </div>
  );
}
