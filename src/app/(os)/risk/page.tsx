import { requireUser } from "@/lib/supabase/server";
import { paperSnapshot } from "@/server/queries";
import { D, sum } from "@/core/money/decimal";
import { PageHeader, Section, Stat, Empty, Badge, money } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { killSwitch, clearHalts } from "@/server/actions";
import { LimitsForm } from "./LimitsForm";

export default async function Risk() {
  const { sb, user } = (await requireUser())!;
  const [snap, { data: rl }, { data: halts }, { data: events }, { data: s }] = await Promise.all([
    paperSnapshot(sb, user.id),
    sb.from("risk_limits").select("*").eq("user_id", user.id).single(),
    sb.from("trading_halts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("risk_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    sb.from("user_settings").select("emergency_policy").eq("user_id", user.id).single(),
  ]);
  const eq = snap?.equity ?? D(0);
  const dayLoss = snap ? Math.max(0, snap.dayStartEquity.minus(eq).div(snap.dayStartEquity).times(100).toNumber()) : 0;
  const dd = snap && snap.peakEquity.gt(0) ? Math.max(0, snap.peakEquity.minus(eq).div(snap.peakEquity).times(100).toNumber()) : 0;
  const exposure = snap ? sum(snap.positions.map((p) => p.qty.times(p.mark))) : D(0);
  const bySym = new Map<string, number>(); for (const p of snap?.positions ?? []) bySym.set(p.symbol, (bySym.get(p.symbol) ?? 0) + p.qty.times(p.mark).toNumber());
  const active = (halts ?? []).filter((h) => h.active);
  const lim = rl ? Object.fromEntries(Object.entries(rl).filter(([k]) => k.startsWith("max_")).map(([k, v]) => [k, Number(v)])) : {};
  const remaining = rl ? Math.max(0, Number(rl.max_daily_loss_pct) - dayLoss) : 0;
  return (
    <>
      <PageHeader title="Risk Centre" subtitle="Deterministic safeguards. Independent of AI and active even when Claude is unavailable." right={<div className="flex gap-2"><ActionButton action={killSwitch} label="KILL SWITCH" variant="btn-danger" confirm={`Activate kill switch? New orders stop immediately. Emergency policy: ${s?.emergency_policy}.`} />{active.length > 0 && <ActionButton action={clearHalts} label="Clear halts" confirm="Clear all active halts and allow new orders?" />}</div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Daily loss" value={`${dayLoss.toFixed(2)}%`} sub={`limit ${rl?.max_daily_loss_pct}% · remaining ${remaining.toFixed(2)}%`} tone={dayLoss >= Number(rl?.max_daily_loss_pct) * 0.75 ? "bad" : undefined} />
        <Stat label="Drawdown from peak" value={`${dd.toFixed(2)}%`} sub={`limit ${rl?.max_drawdown_pct}%`} tone={dd >= Number(rl?.max_drawdown_pct) * 0.75 ? "bad" : undefined} />
        <Stat label="Gross exposure" value={money(exposure.toString())} sub={eq.gt(0) ? `${exposure.div(eq).times(100).toFixed(1)}% of equity` : ""} />
        <Stat label="Trading status" value={active.length ? "HALTED" : "ACTIVE"} tone={active.length ? "bad" : "good"} sub={`emergency policy: ${s?.emergency_policy}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Position concentration">{bySym.size ? <table className="data"><tbody>{[...bySym].map(([k, v]) => <tr key={k}><td>{k}</td><td className="num text-right">{money(v)}</td><td className="num text-right text-dim">{eq.gt(0) ? ((v / eq.toNumber()) * 100).toFixed(1) : 0}%</td></tr>)}</tbody></table> : <Empty>No exposure.</Empty>}</Section>
        <Section title="Active safeguards & hard limits">{rl ? <LimitsForm limits={lim} /> : <Empty>No risk profile.</Empty>}<p className="mt-2 text-xs text-dim">Database constraints cap limits (e.g. risk/trade ≤ 5%, daily loss ≤ 20%). AI cannot modify limits. Every change is audit-logged.</p></Section>
        <Section title="Trading halts">{halts?.length ? <ul className="space-y-1 text-sm">{halts.map((h) => <li key={h.id} className="flex flex-wrap gap-2"><Badge tone={h.active ? "bad" : "dim"}>{h.active ? "active" : "cleared"}</Badge><span>{h.scope}</span><span className="text-dim">{h.reason}</span><span className="num text-xs text-dim">{new Date(h.created_at).toLocaleString()}</span></li>)}</ul> : <Empty>No halts recorded.</Empty>}</Section>
        <Section title="Risk events">{events?.length ? <ul className="max-h-80 space-y-1 overflow-auto text-sm">{events.map((e) => <li key={e.id} className="flex flex-wrap gap-2"><Badge tone={e.severity === "critical" ? "bad" : e.severity === "warning" ? "warn" : "dim"}>{e.severity}</Badge><span>{e.rule}</span><span className="text-xs text-dim">{JSON.stringify(e.detail).slice(0, 160)}</span></li>)}</ul> : <Empty>No risk events.</Empty>}</Section>
      </div>
    </>
  );
}
