import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { D, ZERO, sum } from "@/core/money/decimal";
import { MockBroker } from "@/core/broker/mock";
import { simulatedCandles, SIM_SYMBOLS } from "@/core/market/simulated";
import { maxDrawdownPct } from "@/core/portfolio/performance";

/** Read model for dashboards. All figures derived from stored data; nothing invented. */
export async function paperSnapshot(sb: SupabaseClient, userId: string) {
  const [{ data: pa }, { data: hist }, { data: closed }] = await Promise.all([
    sb.from("paper_accounts").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("equity_history").select("equity,balance,taken_at").eq("user_id", userId).eq("mode", "paper").order("taken_at", { ascending: true }).limit(2000),
    sb.from("position_history").select("symbol,net_pnl,fees,gross_pnl,strategy_id,closed_at").eq("user_id", userId).eq("mode", "paper"),
  ]);
  if (!pa) return null;
  const broker = new MockBroker(pa.starting_balance); broker.importState(pa.broker_state); await broker.connect();
  for (const s of SIM_SYMBOLS) broker.setPrice(s, simulatedCandles(s, Date.now(), 1).at(-1)!.close.toFixed(6));
  const equity = await broker.getEquity(), balance = await broker.getBalance();
  const positions = (await broker.getOpenPositions()).map((p) => ({ ...p, unrealized: broker.unrealized(p), mark: simulatedCandles(p.symbol, Date.now(), 1).at(-1)!.close }));
  const invested = sum(positions.map((p) => p.qty.times(p.entryPrice)));
  const series = (hist ?? []).map((h) => ({ at: new Date(h.taken_at), equity: D(h.equity) }));
  const equityAt = (ms: number) => { const t = Date.now() - ms; const before = series.filter((s) => s.at.getTime() <= t).at(-1) ?? series[0]; return before?.equity ?? D(pa.starting_balance); };
  const realized = sum((closed ?? []).map((c) => D(c.net_pnl)));
  const fees = sum((closed ?? []).map((c) => D(c.fees)));
  const byDay = new Map<string, ReturnType<typeof D>>();
  for (const s of series) { const k = s.at.toISOString().slice(0, 10); byDay.set(k, s.equity); }
  const days = [...byDay.entries()]; const daily = days.map(([d, e], i) => ({ t: d.slice(5), pnl: i === 0 ? 0 : e.minus(days[i - 1][1]).toNumber() }));
  let peak = ZERO;
  const dd = series.map((s) => { if (s.equity.gt(peak)) peak = s.equity; return { t: s.at.toISOString().slice(5, 16).replace("T", " "), dd: peak.isZero() ? 0 : -peak.minus(s.equity).div(peak).times(100).toNumber() }; });
  return {
    startingBalance: D(pa.starting_balance), equity, balance, invested, unrealized: equity.minus(balance), realized, fees, positions,
    dayStartEquity: D(pa.day_start_equity), peakEquity: D(pa.peak_equity), tradesToday: pa.trades_today,
    pnlDay: equity.minus(D(pa.day_start_equity)), pnlWeek: equity.minus(equityAt(7 * 864e5)), pnlMonth: equity.minus(equityAt(30 * 864e5)),
    curve: series.map((s) => ({ t: s.at.toISOString().slice(5, 16).replace("T", " "), equity: s.equity.toNumber() })),
    daily, drawdown: dd, maxDrawdown: maxDrawdownPct(series.map((s) => s.equity)), closed: closed ?? [], updatedAt: pa.updated_at,
  };
}

