import { requireUser } from "@/lib/supabase/server";
import { paperSnapshot } from "@/server/queries";
import { D, ZERO } from "@/core/money/decimal";
import { PageHeader, Section, Stat, Empty, money, pnlTone, SimBanner } from "@/components/ui";
import { EquityChart, PnlBars } from "@/components/Charts";

export default async function Performance() {
  const { sb, user } = (await requireUser())!;
  const snap = await paperSnapshot(sb, user.id);
  if (!snap) return <><PageHeader title="Performance" /><Empty>No paper trading history yet.</Empty></>;
  const c = snap.closed; const wins = c.filter((x) => Number(x.net_pnl) > 0);
  const gp = c.reduce((a, x) => (Number(x.net_pnl) > 0 ? a.plus(x.net_pnl) : a), ZERO), gl = c.reduce((a, x) => (Number(x.net_pnl) <= 0 ? a.plus(D(x.net_pnl).abs()) : a), ZERO);
  const gross = c.reduce((a, x) => a.plus(x.gross_pnl), ZERO);
  const monthly = new Map<string, number>(); for (const x of c) { const k = x.closed_at.slice(0, 7); monthly.set(k, (monthly.get(k) ?? 0) + Number(x.net_pnl)); }
  return (
    <>
      <PageHeader title="Performance" subtitle="Paper trading results. Deposits are never counted as returns." />
      <SimBanner />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Starting capital" value={money(snap.startingBalance.toString())} />
        <Stat label="Gross realized P/L" value={money(gross.toString())} tone={pnlTone(gross.toString())} />
        <Stat label="Fees" value={money(snap.fees.toString())} />
        <Stat label="Net realized P/L" value={money(snap.realized.toString())} tone={pnlTone(snap.realized.toString())} />
        <Stat label="Unrealized P/L" value={money(snap.unrealized.toString())} tone={pnlTone(snap.unrealized.toString())} />
        <Stat label="Closed trades" value={c.length} sub={c.length ? `win rate ${((wins.length / c.length) * 100).toFixed(1)}%` : ""} />
        <Stat label="Profit factor" value={gl.isZero() ? "—" : gp.div(gl).toFixed(2)} />
        <Stat label="Max drawdown" value={`${snap.maxDrawdown.toFixed(2)}%`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Equity curve">{snap.curve.length > 1 ? <EquityChart data={snap.curve} /> : <Empty>Not enough history.</Empty>}</Section>
        <Section title="Monthly net P/L">{monthly.size ? <PnlBars data={[...monthly].map(([t, pnl]) => ({ t, pnl }))} /> : <Empty>No closed trades.</Empty>}</Section>
      </div>
    </>
  );
}
