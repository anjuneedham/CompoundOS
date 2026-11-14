import { requireUser } from "@/lib/supabase/server";
import { paperSnapshot } from "@/server/queries";
import { Stat, Section, Empty, Badge, PageHeader, money, pnlTone, SimBanner } from "@/components/ui";
import { EquityChart, PnlBars, DrawdownChart, AllocationPie } from "@/components/Charts";
import { ActionButton } from "@/components/ActionButton";
import { runCycleNow } from "@/server/actions";

export default async function Overview() {
  const { sb, user } = (await requireUser())!;
  const [snap, { data: settings }, { data: strats }, { data: aiLast }, { data: halts }] = await Promise.all([
    paperSnapshot(sb, user.id),
    sb.from("user_settings").select("trading_mode").eq("user_id", user.id).single(),
    sb.from("trading_strategies").select("id,name,is_active").eq("user_id", user.id),
    sb.from("ai_decision_logs").select("ok,created_at,error").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("trading_halts").select("scope,reason").eq("user_id", user.id).eq("active", true),
  ]);
  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;
  const active = (strats ?? []).filter((s) => s.is_active);
  const stratPnl = new Map<string, number>();
  for (const c of snap?.closed ?? []) stratPnl.set(c.symbol, (stratPnl.get(c.symbol) ?? 0) + Number(c.net_pnl));

  return (
    <>
      <PageHeader title="Overview" subtitle="Capital, risk and system status at a glance." right={<ActionButton action={runCycleNow} label="Run paper cycle now" variant="btn-primary" />} />
      <SimBanner />
      {(halts ?? []).length > 0 && <div className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">Trading halted: {halts!.map((h) => h.reason).join("; ")}. Review in Risk Centre.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total equity" value={snap ? money(snap.equity.toString()) : "—"} sub="paper USD" />
        <Stat label="Available balance" value={snap ? money(snap.balance.toString()) : "—"} />
        <Stat label="Invested (notional)" value={snap ? money(snap.invested.toString()) : "—"} />
        <Stat label="Unrealized P/L" value={snap ? money(snap.unrealized.toString()) : "—"} tone={snap ? pnlTone(snap.unrealized.toString()) : undefined} />
        <Stat label="Daily P/L" value={snap ? money(snap.pnlDay.toString()) : "—"} tone={snap ? pnlTone(snap.pnlDay.toString()) : undefined} />
        <Stat label="Weekly P/L" value={snap ? money(snap.pnlWeek.toString()) : "—"} tone={snap ? pnlTone(snap.pnlWeek.toString()) : undefined} />
        <Stat label="Monthly P/L" value={snap ? money(snap.pnlMonth.toString()) : "—"} tone={snap ? pnlTone(snap.pnlMonth.toString()) : undefined} />
        <Stat label="Total realized P/L (net)" value={snap ? money(snap.realized.toString()) : "—"} tone={snap ? pnlTone(snap.realized.toString()) : undefined} sub={snap ? `fees ${money(snap.fees.toString())}` : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open positions" value={snap?.positions.length ?? 0} />
        <Stat label="Active strategies" value={active.length} sub={`${strats?.length ?? 0} total`} />
        <Stat label="Trading mode" value={(settings?.trading_mode ?? "research").toUpperCase()} />
        <Stat label="AI system" value={aiConfigured ? (aiLast && !aiLast.ok ? "DEGRADED" : "READY") : "NOT CONFIGURED"} tone={aiConfigured ? (aiLast && !aiLast.ok ? "warn" : "good") : "warn"} sub={aiLast ? `last run ${new Date(aiLast.created_at).toLocaleString()}` : "no runs yet"} />
        <Stat label="Broker" value="Mock (paper)" tone="good" sub="no live broker connected" />
      </div>
      {!snap ? (
        <div className="mt-6"><Empty>No paper account yet. Switch to <b>Paper</b> mode in Settings, create a strategy, then run a paper cycle.</Empty></div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><Section title="Equity curve">{snap.curve.length > 1 ? <EquityChart data={snap.curve} /> : <Empty>Equity history appears after a few cycles.</Empty>}</Section></div>
          <Section title="Asset allocation">{snap.positions.length ? <AllocationPie data={[...snap.positions.map((p) => ({ name: p.symbol, value: p.qty.times(p.entryPrice).toNumber() })), { name: "Cash", value: snap.balance.toNumber() }]} /> : <Empty>All cash. No open positions.</Empty>}</Section>
          <Section title="Daily performance">{snap.daily.length > 1 ? <PnlBars data={snap.daily} /> : <Empty>Needs at least two days of history.</Empty>}</Section>
          <Section title="Drawdown history">{snap.drawdown.length > 1 ? <DrawdownChart data={snap.drawdown} /> : <Empty>No history yet.</Empty>}</Section>
          <Section title="Realized P/L by instrument">{stratPnl.size ? <PnlBars data={[...stratPnl].map(([t, pnl]) => ({ t, pnl }))} /> : <Empty>No closed trades yet.</Empty>}</Section>
        </div>
      )}
      <p className="mt-6 text-xs text-dim">Live trading: <Badge>disabled</Badge> — requires a verified broker integration and a separate authorization milestone.</p>
    </>
  );
}
