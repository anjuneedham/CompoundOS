import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { D, Decimal } from "@/core/money/decimal";
import { MockBroker } from "@/core/broker/mock";
import { ExecutionEngine } from "@/core/execution/engine";
import { STRATEGIES } from "@/core/strategy/types";
import { simulatedCandles, SIM_SYMBOLS } from "@/core/market/simulated";
import { AiOrchestrator, proposalToSignal } from "@/core/ai/orchestrator";
import { createAnthropicTransport } from "@/core/ai/anthropic";
import { sma, rsi, atr } from "@/core/indicators";
import type { Signal } from "@/core/types";
import { SupabaseExecutionStore } from "./store";
import { loadContext, inSchedule } from "./context";

const START = "10000";

async function loadPaper(db: SupabaseClient, userId: string) {
  const { data } = await db.from("paper_accounts").select("*").eq("user_id", userId).maybeSingle();
  const broker = new MockBroker(START);
  if (data) broker.importState(data.broker_state);
  await broker.connect();
  const today = new Date().toISOString().slice(0, 10);
  const equityNow = await broker.getEquity();
  const fresh = !data || data.day !== today;
  const day = {
    dayStartEquity: fresh ? equityNow : D(data.day_start_equity),
    peakEquity: data ? D(data.peak_equity) : equityNow,
    tradesToday: fresh ? 0 : data.trades_today,
  };
  return { broker, day, today, isNew: !data };
}

async function savePaper(db: SupabaseClient, userId: string, broker: MockBroker, day: { dayStartEquity: Decimal; peakEquity: Decimal; tradesToday: number }, today: string) {
  const { error } = await db.from("paper_accounts").upsert({
    user_id: userId, broker_state: broker.exportState(), day: today, day_start_equity: day.dayStartEquity.toString(),
    peak_equity: day.peakEquity.toString(), trades_today: day.tradesToday, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const [eq, bal] = [await broker.getEquity(), await broker.getBalance()];
  await db.from("equity_history").insert({ user_id: userId, mode: "paper", equity: eq.toString(), balance: bal.toString() });
}

async function setLatestPrices(broker: MockBroker, now: number) {
  const bars: Record<string, { high: number; low: number; close: number; time: number }> = {};
  for (const s of SIM_SYMBOLS) { const c = simulatedCandles(s, now, 2).at(-1)!; bars[s] = c; broker.setPrice(s, c.close.toFixed(6)); }
  return bars;
}

export async function getPaperEngine(db: SupabaseClient, userId: string) {
  const ctx = await loadContext(db, userId);
  if (ctx.mode === "live") throw new Error("live mode is not available in this release");
  const p = await loadPaper(db, userId);
  const store = new SupabaseExecutionStore(db, userId, "paper");
  await store.preload();
  const engine = new ExecutionEngine(p.broker, store, {
    mode: ctx.mode, liveAuthorized: false, limits: ctx.limits, halts: ctx.halts, emergencyPolicy: ctx.emergencyPolicy,
    isMarketOpen: () => inSchedule(ctx.schedule),
  }, p.day);
  return { ctx, engine, store, ...p };
}

/** One autonomous paper cycle: exits -> risk monitor -> strategy signals -> execution -> persist. */
export async function runPaperCycle(db: SupabaseClient, userId: string, now = Date.now(), opts: { entries?: boolean } = {}) {
  const { ctx, engine, broker, day, today } = await getPaperEngine(db, userId);
  const log: string[] = [];
  const bars = await setLatestPrices(broker, now);

  for (const c of await broker.processStopsAndTargets(bars)) {
    await db.from("position_history").insert({
      user_id: userId, broker_position_id: c.position.id, mode: "paper", symbol: c.position.symbol, side: c.position.side, qty: c.position.qty.toString(),
      entry_price: c.position.entryPrice.toString(), exit_price: c.result.avgPrice!.toString(), gross_pnl: c.pnl.plus(c.result.fee).toString(), fees: c.result.fee.toString(), net_pnl: c.pnl.toString(), opened_at: c.position.openedAt.toISOString(),
    });
    log.push(`closed ${c.position.symbol} by ${c.reason}: ${c.pnl.toFixed(2)}`);
  }

  const mon = await engine.monitor();
  if (mon.breaches.length) {
    await db.from("trading_halts").insert({ user_id: userId, scope: "global", reason: `auto: ${mon.breaches.join(",")}` });
    await db.from("risk_events").insert({ user_id: userId, severity: "critical", rule: mon.breaches.join(","), detail: { closed: mon.closed } });
    log.push(`HALT: ${mon.breaches.join(",")}`);
  }

  if (opts.entries === false) log.push("risk monitor only: no new entries");
  else if (ctx.mode === "paper" && !engine.cfg.halts.global && !engine.cfg.halts.killSwitch) {
    for (const s of ctx.strategies.filter((x) => x.is_active && !x.is_halted)) {
      const def = STRATEGIES[s.kind]; if (!def) continue;
      const params = { ...def.defaults, ...s.params };
      for (const sym of s.symbols.filter((x) => SIM_SYMBOLS.includes(x))) {
        const candles = simulatedCandles(sym, now, 300);
        const i = candles.length - 1;
        const e = def.evaluate(candles, i, params);
        if (!e) continue;
        const entry = D(candles[i].close.toFixed(6));
        const sd = D(e.stopDistance.toFixed(6));
        const signal: Signal = {
          strategyId: s.id, symbol: sym, side: e.side, entryPrice: entry,
          stopLoss: e.side === "buy" ? entry.minus(sd) : entry.plus(sd),
          takeProfit: e.takeProfitDistance ? (e.side === "buy" ? entry.plus(e.takeProfitDistance.toFixed(6)) : entry.minus(e.takeProfitDistance.toFixed(6))) : undefined,
          reason: e.reason, source: "strategy", createdAt: new Date(candles[i].time),
        };
        await db.from("trading_signals").insert({ user_id: userId, strategy_id: s.id, source: "strategy", symbol: sym, side: e.side, entry_price: entry.toString(), stop_loss: signal.stopLoss.toString(), take_profit: signal.takeProfit?.toString() ?? null, reason: e.reason });
        const r = await engine.execute(signal);
        log.push(`${s.name} ${sym} ${e.side}: ${r.executed ? "EXECUTED" : "not executed"} (${r.message})`);
        if (!r.executed && r.intent.status === "risk_rejected") await db.from("risk_events").insert({ user_id: userId, severity: "info", rule: "signal_rejected", detail: { reasons: r.intent.decision.rejectionReasons } });
      }
    }
  } else log.push(`no new entries (mode=${ctx.mode}, halted=${engine.cfg.halts.global || engine.cfg.halts.killSwitch})`);

  await engine.reconcile();
  await savePaper(db, userId, broker, day, today);
  return log;
}

export async function activateKillSwitch(db: SupabaseClient, userId: string) {
  const { engine, broker, day, today } = await getPaperEngine(db, userId);
  await setLatestPrices(broker, Date.now());
  const closed = await engine.killSwitch();
  await db.from("trading_halts").insert({ user_id: userId, scope: "kill_switch", reason: "manual kill switch" });
  await db.from("risk_events").insert({ user_id: userId, severity: "critical", rule: "kill_switch", detail: { closed, policy: engine.cfg.emergencyPolicy } });
  await engine.reconcile();
  await savePaper(db, userId, broker, day, today);
  return closed;
}

export async function aiBudgetCheck(db: SupabaseClient, userId: string): Promise<{ ok: false; error: string } | null> {
  const { data: s } = await db.from("user_settings").select("ai_daily_token_budget").eq("user_id", userId).single();
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { data: used } = await db.from("ai_decision_logs").select("input_tokens,output_tokens").eq("user_id", userId).gte("created_at", since.toISOString());
  const spent = (used ?? []).reduce((a, r) => a + r.input_tokens + r.output_tokens, 0);
  return s && spent >= s.ai_daily_token_budget ? { ok: false, error: `daily AI token budget reached (${spent}/${s.ai_daily_token_budget})` } : null;
}

export function aiLogSink(db: SupabaseClient, userId: string) {
  return { record: async (e: { capability: string; inputHash: string; ok: boolean; output?: unknown; error?: string; inputTokens: number; outputTokens: number; model: string; cached: boolean }) => {
    await db.from("ai_decision_logs").insert({ user_id: userId, capability: e.capability, input_hash: e.inputHash, ok: e.ok, error: e.error ?? null, model: e.model, input_tokens: e.inputTokens, output_tokens: e.outputTokens, cached: e.cached });
    if (e.ok && !e.cached) await db.from("ai_research").insert({ user_id: userId, capability: e.capability, input_hash: e.inputHash, output: e.output });
  } };
}

/** Compact, approved market summary sent to Claude (no credentials, no account identifiers). */
export function marketBrief(symbol: string, now = Date.now()) {
  const c = simulatedCandles(symbol, now, 200), closes = c.map((x) => x.close);
  const last = c.length - 1;
  return {
    symbol, dataSource: "SIMULATED feed (not real market data)", timeframe: "1h",
    lastClose: closes[last], sma20: sma(closes, 20)[last], sma50: sma(closes, 50)[last], rsi14: rsi(closes, 14)[last], atr14: atr(c, 14)[last],
    high200: Math.max(...c.map((x) => x.high)), low200: Math.min(...c.map((x) => x.low)),
    recentCloses: closes.slice(-24).map((x) => +x.toFixed(5)),
  };
}

export async function runAiResearch(db: SupabaseClient, userId: string, symbol: string, { execute }: { execute: boolean }) {
  const budget = await aiBudgetCheck(db, userId);
  if (budget) return budget;
  const ai = new AiOrchestrator(createAnthropicTransport(), aiLogSink(db, userId));
  if (!ai.available) return { ok: false, error: "AI unavailable: ANTHROPIC_API_KEY not configured on the server. Risk controls and paper trading continue to work." };
  const brief = marketBrief(symbol);
  const a = await ai.run("market_analyst", brief);
  if (!a.ok) return a;
  await db.from("ai_market_assessments").insert({ user_id: userId, symbol, regime: a.data.regime, volatility: a.data.volatility, confidence: a.data.confidence, summary: a.data.summary, raw: a.data });
  const p = await ai.run("trade_proposer", { brief, assessment: a.data });
  if (!p.ok) return p;
  const conv = proposalToSignal(p.data, new Date(Math.floor(Date.now() / 3600_000) * 3600_000));
  let riskApproved: boolean | null = null, reasons: string[] = conv.reason ? [conv.reason] : [], executed = false;
  if (conv.signal && execute) {
    const { engine, broker, day, today } = await getPaperEngine(db, userId);
    await setLatestPrices(broker, Date.now());
    const r = await engine.execute(conv.signal);
    riskApproved = r.intent.decision.approved; reasons = r.intent.decision.rejectionReasons; executed = r.executed;
    await savePaper(db, userId, broker, day, today);
  }
  await db.from("ai_trade_proposals").insert({ user_id: userId, symbol, action: p.data.action, side: p.data.side, entry_price: p.data.entryPrice, stop_loss: p.data.stopLoss, take_profit: p.data.takeProfit, rationale: p.data.rationale, confidence: p.data.confidence, risk_approved: riskApproved, rejection_reasons: reasons });
  return { ok: true as const, assessment: a.data, proposal: p.data, riskApproved, executed, reasons };
}

/** Risk monitor job: marks positions, processes stops/targets, enforces hard limits. Never opens trades. */
export const runRiskMonitor = (db: SupabaseClient, userId: string) => runPaperCycle(db, userId, Date.now(), { entries: false });

/** Scheduled AI research over the symbols of active strategies (max 3 per run, budget-limited). */
export async function runScheduledResearch(db: SupabaseClient, userId: string) {
  const ctx = await loadContext(db, userId);
  const syms = [...new Set(ctx.strategies.filter((s) => s.is_active).flatMap((s) => s.symbols))].filter((s) => SIM_SYMBOLS.includes(s)).slice(0, 3);
  const out: string[] = [];
  for (const sym of syms.length ? syms : [SIM_SYMBOLS[0]]) {
    const r = await runAiResearch(db, userId, sym, { execute: ctx.mode === "paper" });
    out.push(`${sym}: ${r.ok ? `${r.proposal?.action}${r.executed ? " (executed)" : ""}` : r.error}`);
    if (!r.ok) break;
  }
  return out;
}
