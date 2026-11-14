"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { runPaperCycle, activateKillSwitch, runAiResearch, runRiskMonitor } from "./paper";
import { runStrategyReview, runRiskReview, generateReport } from "./ai-jobs";
import { STRATEGIES } from "@/core/strategy/types";
import { runBacktest, splitInOut, walkForward } from "@/core/backtest/engine";
import { simulatedCandles, SIM_SYMBOLS } from "@/core/market/simulated";

/** Every action: verify session server-side, then act ONLY on the verified user id. */
async function ctx() {
  const u = await requireUser();
  if (!u) throw new Error("unauthorized");
  return { userId: u.user.id, db: supabaseAdmin(), sb: u.sb };
}
async function audit(db: ReturnType<typeof supabaseAdmin>, userId: string, action: string, detail: Record<string, unknown> = {}) {
  await db.from("audit_logs").insert({ user_id: userId, actor: "user", action, detail });
}
const done = () => revalidatePath("/", "layout");

export async function setMode(mode: string) {
  const m = z.enum(["research", "paper"]).parse(mode); // live is not selectable in this release
  const { userId, db } = await ctx();
  await db.from("user_settings").update({ trading_mode: m }).eq("user_id", userId);
  await audit(db, userId, "mode_changed", { mode: m }); done();
}

export async function runCycleNow() {
  const { userId, db } = await ctx();
  const log = await runPaperCycle(db, userId);
  await audit(db, userId, "manual_cycle", { log }); done();
  return log;
}

export async function killSwitch() {
  const { userId, db } = await ctx();
  const closed = await activateKillSwitch(db, userId);
  await audit(db, userId, "kill_switch", { closed }); done();
  return closed;
}

export async function clearHalts() {
  const { userId, db } = await ctx();
  await db.from("trading_halts").update({ active: false, cleared_at: new Date().toISOString() }).eq("user_id", userId).eq("active", true);
  await audit(db, userId, "halts_cleared"); done();
}

const StrategyInput = z.object({ name: z.string().min(2).max(60), kind: z.enum(Object.keys(STRATEGIES) as [string, ...string[]]), symbols: z.array(z.enum(SIM_SYMBOLS as [string, ...string[]])).min(1), params: z.record(z.string(), z.number().finite()) });
export async function createStrategy(input: unknown) {
  const v = StrategyInput.parse(input);
  const { userId, db } = await ctx();
  const { data: s, error } = await db.from("trading_strategies").insert({ user_id: userId, name: v.name, kind: v.kind, symbols: v.symbols }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("strategy_versions").insert({ strategy_id: s.id, user_id: userId, version: 1, params: v.params });
  await audit(db, userId, "strategy_created", { id: s.id, ...v }); done();
}
export async function newStrategyVersion(strategyId: string, params: Record<string, number>) {
  z.string().uuid().parse(strategyId); z.record(z.string(), z.number().finite()).parse(params);
  const { userId, db } = await ctx();
  const { data: own } = await db.from("trading_strategies").select("id").eq("id", strategyId).eq("user_id", userId).single();
  if (!own) throw new Error("not found");
  const { data: last } = await db.from("strategy_versions").select("version").eq("strategy_id", strategyId).order("version", { ascending: false }).limit(1).single();
  await db.from("strategy_versions").insert({ strategy_id: strategyId, user_id: userId, version: (last?.version ?? 0) + 1, params });
  await audit(db, userId, "strategy_version_created", { strategyId, params }); done();
}
export async function toggleStrategy(id: string, active: boolean) {
  z.string().uuid().parse(id);
  const { userId, db } = await ctx();
  await db.from("trading_strategies").update({ is_active: active }).eq("id", id).eq("user_id", userId);
  await audit(db, userId, active ? "strategy_activated" : "strategy_deactivated", { id }); done();
}

const BtInput = z.object({ kind: z.string(), symbol: z.enum(SIM_SYMBOLS as [string, ...string[]]), params: z.record(z.string(), z.number().finite()), bars: z.number().int().min(300).max(5000), strategyId: z.string().uuid().optional() });
export async function backtest(input: unknown) {
  const v = BtInput.parse(input);
  const def = STRATEGIES[v.kind]; if (!def) throw new Error("unknown strategy");
  const { userId, db } = await ctx();
  const candles = simulatedCandles(v.symbol, Date.now(), v.bars);
  const params = { ...def.defaults, ...v.params };
  const isFx = v.symbol !== "SYN100";
  const cfg = { startingEquity: 10000, riskPct: "0.5", spread: isFx ? "0.0001" : "0.05", slippage: isFx ? "0.00002" : "0.01", feePerUnit: isFx ? "0.00002" : "0.001", qtyStep: isFx ? 1000 : "0.01" };
  const { inSample, outOfSample } = splitInOut(candles, 0.7);
  const ins = runBacktest(inSample, def, params, cfg), oos = runBacktest(outOfSample, def, params, cfg);
  const grid = [params, { ...params, ...(params.fast ? { fast: Math.max(2, params.fast - 3) } : { period: Math.max(2, (params.period ?? 14) - 4) }) }];
  const wf = walkForward(candles, def, grid, cfg, 3);
  if (v.strategyId) {
    const { data: ver } = await db.from("strategy_versions").select("id").eq("strategy_id", v.strategyId).eq("user_id", userId).order("version", { ascending: false }).limit(1).single();
    if (ver) await db.from("strategy_performance").insert([
      { user_id: userId, strategy_version_id: ver.id, kind: "backtest_in_sample", config: { ...cfg, symbol: v.symbol, bars: inSample.length }, metrics: ins.metrics },
      { user_id: userId, strategy_version_id: ver.id, kind: "backtest_out_of_sample", config: { ...cfg, symbol: v.symbol, bars: outOfSample.length }, metrics: oos.metrics },
      { user_id: userId, strategy_version_id: ver.id, kind: "walk_forward", config: { symbol: v.symbol }, metrics: { windows: wf } },
    ]);
  }
  const thin = (c: { time: number; equity: number }[]) => c.filter((_, i) => i % Math.ceil(c.length / 200) === 0).map((p) => ({ t: new Date(p.time).toISOString().slice(5, 13).replace("T", " "), equity: p.equity }));
  return { inSample: { metrics: ins.metrics, curve: thin(ins.equityCurve) }, outOfSample: { metrics: oos.metrics, curve: thin(oos.equityCurve) }, walkForward: wf, cfg };
}

export async function runAi(symbol: string, execute: boolean) {
  const s = z.enum(SIM_SYMBOLS as [string, ...string[]]).parse(symbol);
  const { userId, db } = await ctx();
  const rl = await aiRateLimit(db, userId); if (rl) return rl;
  const r = await runAiResearch(db, userId, s, { execute });
  await audit(db, userId, "ai_research_run", { symbol: s, execute, ok: r.ok }); done();
  return JSON.parse(JSON.stringify(r));
}

const LimitsInput = z.object({
  max_risk_per_trade_pct: z.number().gt(0).max(5), max_daily_loss_pct: z.number().gt(0).max(20), max_drawdown_pct: z.number().gt(0).max(50),
  max_concurrent_positions: z.number().int().min(1).max(50), max_daily_trades: z.number().int().min(1).max(500),
  max_exposure_per_instrument_pct: z.number().gt(0).max(3000), max_correlated_exposure_pct: z.number().gt(0).max(5000),
});
/** Explicit, user-authorized change to hard limits. Not callable by AI paths. */
export async function updateRiskLimits(input: unknown, confirm: string) {
  if (confirm !== "CHANGE LIMITS") throw new Error("confirmation phrase required");
  const v = LimitsInput.parse(input);
  const { userId, db } = await ctx();
  const { data: before } = await db.from("risk_limits").select("*").eq("user_id", userId).single();
  await db.from("risk_limits").update({ ...v, updated_by: "user" }).eq("user_id", userId);
  await audit(db, userId, "risk_limits_changed", { before, after: v }); done();
}

const JOB_NAMES = ["risk_monitor", "paper_cycle", "ai_research", "daily_report"] as const;
const SettingsInput = z.object({
  emergency_policy: z.enum(["halt_only", "close_all", "close_losing"]), ai_daily_token_budget: z.number().int().min(0).max(5_000_000),
  jobs: z.array(z.object({ job: z.enum(JOB_NAMES), enabled: z.boolean(), interval_minutes: z.number().int().min(15).max(10080) })).max(4),
});
export async function updateSettings(input: unknown) {
  const v = SettingsInput.parse(input);
  const { userId, db } = await ctx();
  await db.from("user_settings").update({ emergency_policy: v.emergency_policy, ai_daily_token_budget: v.ai_daily_token_budget }).eq("user_id", userId);
  if (v.jobs.length) await db.from("scheduled_jobs").upsert(v.jobs.map((j) => ({ user_id: userId, ...j })), { onConflict: "user_id,job" });
  await audit(db, userId, "settings_changed", v); done();
}

/** AI rate limit shared by all manual AI buttons: one call per 30s per user. */
async function aiRateLimit(db: ReturnType<typeof supabaseAdmin>, userId: string) {
  const { data: last } = await db.from("ai_decision_logs").select("created_at").eq("user_id", userId).eq("cached", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return last && Date.now() - new Date(last.created_at).getTime() < 30_000 ? { ok: false as const, error: "rate limited: wait 30s between AI runs" } : null;
}
export async function reviewStrategy(strategyId: string) {
  z.string().uuid().parse(strategyId);
  const { userId, db } = await ctx();
  const rl = await aiRateLimit(db, userId); if (rl) return rl;
  const r = await runStrategyReview(db, userId, strategyId);
  await audit(db, userId, "ai_strategy_review", { strategyId, ok: r.ok }); done();
  return r;
}
export async function reviewRisk() {
  const { userId, db } = await ctx();
  const rl = await aiRateLimit(db, userId); if (rl) return rl;
  const r = await runRiskReview(db, userId);
  await audit(db, userId, "ai_risk_review", { ok: r.ok }); done();
  return r;
}
export async function makeReport(period: string) {
  const p = z.enum(["daily", "weekly", "monthly"]).parse(period);
  const { userId, db } = await ctx();
  const r = await generateReport(db, userId, p);
  await audit(db, userId, "report_generated", { period: p, ai: !r.aiError }); done();
  return JSON.parse(JSON.stringify(r));
}
export async function runRiskMonitorNow() {
  const { userId, db } = await ctx();
  const log = await runRiskMonitor(db, userId);
  await audit(db, userId, "manual_risk_monitor", { log }); done();
  return log;
}

const TxInput = z.object({ portfolio_id: z.string().uuid(), type: z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee"]), symbol: z.string().max(20).optional(), qty: z.string().regex(/^\d+(\.\d+)?$/).optional(), price: z.string().regex(/^\d+(\.\d+)?$/).optional(), amount: z.string().regex(/^\d+(\.\d{1,10})?$/), note: z.string().max(200).optional() });
export async function addInvestmentTx(input: unknown) {
  const v = TxInput.parse(input);
  const { userId, db } = await ctx();
  const { data: p } = await db.from("portfolios").select("id").eq("id", v.portfolio_id).eq("user_id", userId).single();
  if (!p) throw new Error("portfolio not found");
  await db.from("investment_transactions").insert({ ...v, user_id: userId });
  await audit(db, userId, "investment_tx_added", v); done();
}

export async function resetPaperAccount(confirm: string) {
  if (confirm !== "RESET") throw new Error("confirmation required");
  const { userId, db } = await ctx();
  await db.from("paper_accounts").delete().eq("user_id", userId);
  await db.from("open_positions").delete().eq("user_id", userId).eq("mode", "paper");
  await audit(db, userId, "paper_account_reset"); done();
}
