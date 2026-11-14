"use client";
import { useState, useTransition } from "react";
import { updateRiskLimits } from "@/server/actions";

const FIELDS: [string, string][] = [["max_risk_per_trade_pct", "Max risk per trade %"], ["max_daily_loss_pct", "Max daily loss %"], ["max_drawdown_pct", "Max drawdown %"], ["max_concurrent_positions", "Max concurrent positions"], ["max_daily_trades", "Max daily trades"], ["max_exposure_per_instrument_pct", "Max exposure per instrument % (notional/equity)"], ["max_correlated_exposure_pct", "Max correlated exposure %"]];
export function LimitsForm({ limits }: { limits: Record<string, number> }) {
  const [v, setV] = useState(limits); const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const c = window.prompt('Changing hard risk limits. Type "CHANGE LIMITS" to confirm.'); if (!c) return; start(async () => { try { await updateRiskLimits(v, c); setMsg("Limits updated and audited."); } catch (err) { setMsg((err as Error).message); } }); }}>
      {FIELDS.map(([k, l]) => <label key={k} className="text-xs text-dim">{l}<input className="input num" type="number" step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></label>)}
      <button className="btn sm:col-span-2" disabled={pending}>Update limits</button>
      {msg && <p className="text-sm text-dim sm:col-span-2">{msg}</p>}
    </form>
  );
}
