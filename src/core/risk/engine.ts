import { D, Decimal, ZERO, sum } from "../money/decimal";
import type { AccountState, Instrument, Position, Signal, TradingMode } from "../types";
import type { RiskLimits } from "./limits";

/**
 * Deterministic risk engine. Independent of AI. Every order intent passes here.
 * AI output is treated exactly like any other untrusted signal.
 */

export interface HaltState {
  global: boolean;
  killSwitch: boolean;
  haltedStrategies: string[];
}

export interface RiskContext {
  mode: TradingMode;
  liveAuthorized: boolean;
  account: AccountState;
  instrument: Instrument | undefined;
  openPositions: Position[];
  instruments: Record<string, Instrument>;
  limits: RiskLimits;
  halts: HaltState;
  tradesToday: number;
  /** Keys of intents already submitted (idempotency / duplicates). */
  existingIntentKeys: Set<string>;
  intentKey: string;
  marketOpen: boolean;
}

export type RiskCheck = { rule: string; passed: boolean; detail: string };
export interface RiskDecision {
  approved: boolean;
  qty: Decimal;
  riskAmount: Decimal;
  checks: RiskCheck[];
  rejectionReasons: string[];
}

export const pct = (part: Decimal, whole: Decimal) => (whole.isZero() ? D(0) : part.div(whole).times(100));

export function dailyLossPct(a: AccountState): Decimal {
  const loss = a.dayStartEquity.minus(a.equity);
  return loss.lte(0) ? ZERO : pct(loss, a.dayStartEquity);
}
export function drawdownPct(a: AccountState): Decimal {
  const dd = a.peakEquity.minus(a.equity);
  return dd.lte(0) ? ZERO : pct(dd, a.peakEquity);
}

/** Position size so that a stop-out loses at most riskPct of equity. Rounded DOWN to qtyStep. */
export function positionSize(equity: Decimal, riskPct: Decimal, entry: Decimal, stop: Decimal, inst: Instrument) {
  const perUnitRisk = entry.minus(stop).abs().times(inst.contractSize);
  if (perUnitRisk.isZero()) return { qty: ZERO, riskAmount: ZERO };
  const budget = equity.times(riskPct).div(100);
  const raw = budget.div(perUnitRisk);
  const qty = raw.div(inst.qtyStep).floor().times(inst.qtyStep);
  return { qty, riskAmount: qty.times(perUnitRisk) };
}

export function notional(qty: Decimal, price: Decimal, inst: Instrument) {
  return qty.times(price).times(inst.contractSize);
}

export function evaluateSignal(signal: Signal, ctx: RiskContext): RiskDecision {
  const checks: RiskCheck[] = [];
  const add = (rule: string, passed: boolean, detail: string) => checks.push({ rule, passed, detail });
  const { account: a, limits: L, instrument: inst } = ctx;

  add("mode_allows_execution", ctx.mode !== "research", `mode=${ctx.mode}`);
  add("live_authorized", ctx.mode !== "live" || ctx.liveAuthorized, "live requires explicit authorization");
  add("kill_switch_off", !ctx.halts.killSwitch, "kill switch");
  add("global_halt_off", !ctx.halts.global, "global trading halt");
  add("strategy_not_halted", !ctx.halts.haltedStrategies.includes(signal.strategyId), signal.strategyId);
  add("account_trading_enabled", a.tradingEnabled, "account flag");
  add("broker_connected", a.connected, "broker connection");
  add("market_open", ctx.marketOpen, "market session");
  add("instrument_known", !!inst, signal.symbol);
  add("instrument_permitted", L.allowedSymbols === "all" || L.allowedSymbols.includes(signal.symbol), signal.symbol);
  add("strategy_permitted", L.allowedStrategies === "all" || L.allowedStrategies.includes(signal.strategyId), signal.strategyId);
  add("not_duplicate", !ctx.existingIntentKeys.has(ctx.intentKey), ctx.intentKey);
  add("max_daily_trades", ctx.tradesToday < L.maxDailyTrades, `${ctx.tradesToday}/${L.maxDailyTrades}`);
  add("max_concurrent_positions", ctx.openPositions.length < L.maxConcurrentPositions, `${ctx.openPositions.length}/${L.maxConcurrentPositions}`);

  const dl = dailyLossPct(a), dd = drawdownPct(a);
  add("daily_loss_limit", dl.lt(L.maxDailyLossPct), `${dl.toFixed(3)}% < ${L.maxDailyLossPct}%`);
  add("drawdown_limit", dd.lt(L.maxDrawdownPct), `${dd.toFixed(3)}% < ${L.maxDrawdownPct}%`);

  const stopValid = signal.side === "buy" ? signal.stopLoss.lt(signal.entryPrice) : signal.stopLoss.gt(signal.entryPrice);
  add("stop_loss_valid", stopValid, "stop must be on the losing side of entry");

  let qty = ZERO, riskAmount = ZERO;
  if (inst && stopValid) {
    // Never risk more than the remaining daily allowance either.
    const remainingDaily = L.maxDailyLossPct.minus(dl);
    const effRisk = Decimal.min(L.maxRiskPerTradePct, remainingDaily.gt(0) ? remainingDaily : ZERO);
    ({ qty, riskAmount } = positionSize(a.equity, effRisk, signal.entryPrice, signal.stopLoss, inst));
    add("min_quantity", qty.gte(inst.minQty), `qty=${qty} min=${inst.minQty}`);
    add("risk_per_trade", pct(riskAmount, a.equity).lte(L.maxRiskPerTradePct), `${pct(riskAmount, a.equity).toFixed(3)}%`);

    const n = notional(qty, signal.entryPrice, inst);
    const instExposure = sum(ctx.openPositions.filter((p) => p.symbol === signal.symbol).map((p) => notional(p.qty, p.entryPrice, inst))).plus(n);
    add("instrument_exposure", pct(instExposure, a.equity).lte(L.maxExposurePerInstrumentPct), `${pct(instExposure, a.equity).toFixed(1)}%`);

    if (inst.correlationGroup) {
      const grp = sum(
        ctx.openPositions
          .filter((p) => ctx.instruments[p.symbol]?.correlationGroup === inst.correlationGroup)
          .map((p) => notional(p.qty, p.entryPrice, ctx.instruments[p.symbol]!)),
      ).plus(n);
      add("correlated_exposure", pct(grp, a.equity).lte(L.maxCorrelatedExposurePct), `${inst.correlationGroup} ${pct(grp, a.equity).toFixed(1)}%`);
    }
    const marginOk = a.balance.gt(0) && riskAmount.lte(a.balance);
    add("available_balance", marginOk, `risk ${riskAmount.toFixed(2)} vs balance ${a.balance.toFixed(2)}`);
  }

  const rejectionReasons = checks.filter((c) => !c.passed).map((c) => `${c.rule}: ${c.detail}`);
  return { approved: rejectionReasons.length === 0, qty, riskAmount, checks, rejectionReasons };
}

/** Hard-limit breach check used by monitors to auto-halt trading. */
export function hardLimitBreaches(a: AccountState, L: RiskLimits): string[] {
  const out: string[] = [];
  if (dailyLossPct(a).gte(L.maxDailyLossPct)) out.push("daily_loss");
  if (drawdownPct(a).gte(L.maxDrawdownPct)) out.push("max_drawdown");
  return out;
}

export type EmergencyPolicy = "halt_only" | "close_all" | "close_losing";
