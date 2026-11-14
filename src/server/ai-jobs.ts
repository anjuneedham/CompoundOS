import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { D, ZERO, sum } from "@/core/money/decimal";
import { AiOrchestrator } from "@/core/ai/orchestrator";
import { createAnthropicTransport } from "@/core/ai/anthropic";
import { capitalSummary, type TxType } from "@/core/portfolio/performance";
import { paperSnapshot } from "./queries";
import { aiBudgetCheck, aiLogSink } from "./paper";

const unavailable = { ok: false as const, error: "AI unavailable: ANTHROPIC_API_KEY not configured. Deterministic figures are still recorded." };

async function orchestrator(db: SupabaseClient, userId: string): Promise<{ ai: AiOrchestrator } | { error: { ok: false; error: string } }> {
  const b = await aiBudgetCheck(db, userId); if (b) return { error: b };
  const ai = new AiOrchestrator(createAnthropicTransport(), aiLogSink(db, userId));
  return ai.available ? { ai } : { error: unavailable };
}

/** STRATEGY ANALYST: reviews saved backtests + paper results of one strategy. Advisory only. */
export async function runStrategyReview(db: SupabaseClient, userId: string, strategyId: string) {
  const { data: s } = await db.from("trading_strategies").select("id,name,kind,symbols,strategy_versions(id,version,params)").eq("id", strategyId).eq("user_id", userId).single();
  if (!s) return { ok: false as const, error: "strategy not found" };
  const versions = ((s.strategy_versions as { id: string; version: number; params: Record<string, number> }[]) ?? []).sort((a, b) => b.version - a.version);
  const { data: perf } = await db.from("strategy_performance").select("kind,metrics,config,created_at").eq("user_id", userId).in("strategy_version_id", versions.map((v) => v.id)).order("created_at", { ascending: false }).limit(9);
  const { data: paper } = await db.from("position_history").select("net_pnl,closed_at").eq("user_id", userId).eq("strategy_id", strategyId).limit(500);
  const o = await orchestrator(db, userId); if ("error" in o) return o.error;
  const r = await o.ai.run("strategy_analyst", {
    strategy: { name: s.name, kind: s.kind, symbols: s.symbols, latestVersion: versions[0]?.version, params: versions[0]?.params },
    note: "All backtests use a SIMULATED price feed. Treat in-sample results skeptically.",
    savedResults: perf ?? [], paperClosedTrades: { count: paper?.length ?? 0, netPnl: sum((paper ?? []).map((p) => D(p.net_pnl))).toFixed(2) },
  });
  return r.ok ? { ok: true as const, review: r.data } : r;
}

/** RISK OBSERVER: comments on exposure and loss patterns. Cannot change limits; may only log events. */
export async function runRiskReview(db: SupabaseClient, userId: string) {
  const [snap, { data: limits }, { data: events }] = await Promise.all([
    paperSnapshot(db, userId),
    db.from("risk_limits").select("max_risk_per_trade_pct,max_daily_loss_pct,max_drawdown_pct,max_concurrent_positions,max_daily_trades").eq("user_id", userId).single(),
    db.from("risk_events").select("severity,rule,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
  ]);
  const o = await orchestrator(db, userId); if ("error" in o) return o.error;
  const r = await o.ai.run("risk_observer", {
    limits, recentRiskEvents: events ?? [],
    account: snap ? { equity: snap.equity.toFixed(2), balance: snap.balance.toFixed(2), dayStartEquity: snap.dayStartEquity.toFixed(2), peakEquity: snap.peakEquity.toFixed(2), maxDrawdownPct: snap.maxDrawdown.toFixed(2), tradesToday: snap.tradesToday } : null,
    openPositions: (snap?.positions ?? []).map((p) => ({ symbol: p.symbol, side: p.side, qty: p.qty.toString(), entry: p.entryPrice.toString(), unrealized: p.unrealized.toFixed(2) })),
    recentClosed: (snap?.closed ?? []).slice(-30).map((c) => ({ symbol: c.symbol, net: c.net_pnl, at: c.closed_at })),
  });
  if (!r.ok) return r;
  if (r.data.severity !== "info") await db.from("risk_events").insert({ user_id: userId, severity: r.data.severity, rule: "ai_risk_observation", detail: { observations: r.data.observations } });
  return { ok: true as const, review: r.data };
}

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 } as const;
export type Period = keyof typeof PERIOD_DAYS;

/** Deterministic report figures (always computed), with optional AI narrative. */
export async function generateReport(db: SupabaseClient, userId: string, period: Period) {
  const since = new Date(Date.now() - PERIOD_DAYS[period] * 864e5);
  const [snap, { data: closed }, { data: hist }, { data: tx }] = await Promise.all([
    paperSnapshot(db, userId),
    db.from("position_history").select("symbol,gross_pnl,fees,net_pnl").eq("user_id", userId).eq("mode", "paper").gte("closed_at", since.toISOString()),
    db.from("equity_history").select("equity,taken_at").eq("user_id", userId).eq("mode", "paper").gte("taken_at", since.toISOString()).order("taken_at").limit(1),
    db.from("investment_transactions").select("type,amount,occurred_at").eq("user_id", userId).gte("occurred_at", since.toISOString()),
  ]);
  const c = closed ?? [];
  const lt = capitalSummary((tx ?? []).map((t) => ({ type: t.type as TxType, amount: D(t.amount), at: new Date(t.occurred_at) })), ZERO, ZERO);
  const startEq = hist?.[0] ? D(hist[0].equity) : snap?.startingBalance ?? ZERO;
  const figures = {
    period, from: since.toISOString(), to: new Date().toISOString(), dataSource: "paper trading on SIMULATED market data",
    paper: snap ? {
      startEquity: startEq.toFixed(2), endEquity: snap.equity.toFixed(2), equityChange: snap.equity.minus(startEq).toFixed(2),
      grossRealizedPnl: sum(c.map((x) => D(x.gross_pnl))).toFixed(2), fees: sum(c.map((x) => D(x.fees))).toFixed(2), netRealizedPnl: sum(c.map((x) => D(x.net_pnl))).toFixed(2),
      unrealizedPnl: snap.unrealized.toFixed(2), closedTrades: c.length, wins: c.filter((x) => Number(x.net_pnl) > 0).length, openPositions: snap.positions.length,
    } : null,
    longTermPortfolio: { deposits: lt.deposits.toFixed(2), withdrawals: lt.withdrawals.toFixed(2), dividends: lt.dividends.toFixed(2), fees: lt.fees.toFixed(2), note: "deposits and withdrawals are capital flows, not returns" },
  };
  let narrative: unknown = null, aiError: string | null = null;
  const o = await orchestrator(db, userId);
  if ("error" in o) aiError = o.error.error;
  else { const r = await o.ai.run("portfolio_reporter", figures); if (r.ok) narrative = r.data; else aiError = r.error; }
  await db.from("ai_research").insert({ user_id: userId, capability: "report", input_hash: `${period}:${figures.to}`, output: { figures, narrative, aiError } });
  return { ok: true as const, figures, narrative, aiError };
}
