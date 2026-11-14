import { D, Decimal, ZERO } from "../money/decimal";
import type { Candle } from "../indicators";
import type { StrategyDefinition } from "../strategy/types";

export interface BacktestConfig {
  startingEquity: Decimal.Value;
  riskPct: Decimal.Value;        // per trade, % of equity
  spread: Decimal.Value;         // absolute price units, paid on entry
  slippage: Decimal.Value;       // absolute price units, adverse, on entry and exit
  feePerUnit: Decimal.Value;     // per unit per side
  contractSize?: Decimal.Value;
  qtyStep?: Decimal.Value;
}

export interface BacktestTrade { side: "buy" | "sell"; entryIndex: number; exitIndex: number; entry: number; exit: number; qty: string; pnl: string; fees: string; r: number; exitReason: "stop" | "target" | "end" }

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: { index: number; time: number; equity: number }[];
  metrics: {
    trades: number; winRate: number; profitFactor: number | null; maxDrawdownPct: number; netProfit: string; grossProfit: string; grossLoss: string; fees: string;
    expectancyR: number; avgRewardRisk: number | null; exposurePct: number; endingEquity: string;
  };
}

/**
 * Event-driven bar-by-bar backtest. Signals evaluated on bar i close; entry at bar i+1 OPEN
 * (no look-ahead). If a bar touches both stop and target, assume stop first (conservative).
 */
export function runBacktest<P>(candles: Candle[], strat: StrategyDefinition<P>, params: P, cfg: BacktestConfig): BacktestResult {
  const spread = D(cfg.spread), slip = D(cfg.slippage), fpu = D(cfg.feePerUnit), cs = D(cfg.contractSize ?? 1), step = D(cfg.qtyStep ?? "0.01");
  let equity = D(cfg.startingEquity), peak = equity, maxDD = ZERO, gp = ZERO, gl = ZERO, fees = ZERO, barsInMarket = 0;
  const trades: BacktestTrade[] = [];
  const curve: BacktestResult["equityCurve"] = [];
  let pos: null | { side: "buy" | "sell"; entry: Decimal; stop: Decimal; target?: Decimal; qty: Decimal; idx: number; riskAmt: Decimal; fee: Decimal } = null;

  for (let i = strat.warmup(params); i < candles.length; i++) {
    const bar = candles[i];
    if (pos) {
      barsInMarket++;
      const hitStop = pos.side === "buy" ? bar.low <= pos.stop.toNumber() : bar.high >= pos.stop.toNumber();
      const hitTgt = pos.target && (pos.side === "buy" ? bar.high >= pos.target.toNumber() : bar.low <= pos.target.toNumber());
      const last = i === candles.length - 1;
      if (hitStop || hitTgt || last) {
        const reason = hitStop ? "stop" : hitTgt ? "target" : "end";
        let exit = reason === "stop" ? pos.stop : reason === "target" ? pos.target! : D(bar.close);
        exit = pos.side === "buy" ? exit.minus(slip) : exit.plus(slip);
        const gross = (pos.side === "buy" ? exit.minus(pos.entry) : pos.entry.minus(exit)).times(pos.qty).times(cs);
        const exitFee = pos.qty.times(fpu);
        const tradeFees = pos.fee.plus(exitFee);
        const net = gross.minus(tradeFees);
        equity = equity.plus(gross).minus(exitFee); // entry fee already deducted
        fees = fees.plus(tradeFees);
        if (net.gt(0)) gp = gp.plus(net); else gl = gl.plus(net.abs());
        trades.push({ side: pos.side, entryIndex: pos.idx, exitIndex: i, entry: pos.entry.toNumber(), exit: exit.toNumber(), qty: pos.qty.toString(), pnl: net.toFixed(2), fees: tradeFees.toFixed(2), r: pos.riskAmt.isZero() ? 0 : net.div(pos.riskAmt).toNumber(), exitReason: reason });
        pos = null;
      }
    }
    if (equity.gt(peak)) peak = equity;
    const dd = peak.minus(equity).div(peak).times(100);
    if (dd.gt(maxDD)) maxDD = dd;
    curve.push({ index: i, time: bar.time, equity: equity.toNumber() });

    if (!pos && i + 1 < candles.length) {
      const sig = strat.evaluate(candles, i, params);
      if (sig && sig.stopDistance > 0) {
        const nextOpen = D(candles[i + 1].open);
        const halfSpread = spread.div(2);
        const entry = sig.side === "buy" ? nextOpen.plus(halfSpread).plus(slip) : nextOpen.minus(halfSpread).minus(slip);
        const sd = D(sig.stopDistance);
        const stop = sig.side === "buy" ? entry.minus(sd) : entry.plus(sd);
        const target = sig.takeProfitDistance ? (sig.side === "buy" ? entry.plus(sig.takeProfitDistance) : entry.minus(sig.takeProfitDistance)) : undefined;
        const riskBudget = equity.times(D(cfg.riskPct)).div(100);
        const qty = riskBudget.div(sd.times(cs)).div(step).floor().times(step);
        if (qty.gt(0)) {
          const fee = qty.times(fpu);
          equity = equity.minus(fee);
          pos = { side: sig.side, entry, stop, target, qty, idx: i + 1, riskAmt: qty.times(sd).times(cs), fee };
          i++; // entry occurs on next bar; evaluate exits starting the bar after (conservative)
          curve.push({ index: i, time: candles[i].time, equity: equity.toNumber() });
        }
      }
    }
  }

  const wins = trades.filter((t) => D(t.pnl).gt(0));
  const losses = trades.filter((t) => D(t.pnl).lte(0));
  const avgWin = wins.length ? wins.reduce((a, t) => a + Number(t.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + Number(t.pnl), 0) / losses.length) : 0;
  return {
    trades, equityCurve: curve,
    metrics: {
      trades: trades.length,
      winRate: trades.length ? wins.length / trades.length : 0,
      profitFactor: gl.isZero() ? null : gp.div(gl).toNumber(),
      maxDrawdownPct: maxDD.toNumber(),
      netProfit: equity.minus(D(cfg.startingEquity)).toFixed(2),
      grossProfit: gp.toFixed(2), grossLoss: gl.toFixed(2), fees: fees.toFixed(2),
      expectancyR: trades.length ? trades.reduce((a, t) => a + t.r, 0) / trades.length : 0,
      avgRewardRisk: avgLoss ? avgWin / avgLoss : null,
      exposurePct: candles.length ? (barsInMarket / candles.length) * 100 : 0,
      endingEquity: equity.toFixed(2),
    },
  };
}

/** Split into in-sample / out-of-sample segments. */
export function splitInOut<T>(data: T[], inSampleRatio = 0.7) {
  const k = Math.floor(data.length * inSampleRatio);
  return { inSample: data.slice(0, k), outOfSample: data.slice(k) };
}

/**
 * Walk-forward: for each window, pick best params on the train slice (by net profit),
 * then evaluate those params on the following unseen test slice.
 */
export function walkForward<P>(candles: Candle[], strat: StrategyDefinition<P>, grid: P[], cfg: BacktestConfig, windows = 4, trainRatio = 0.7) {
  const size = Math.floor(candles.length / windows);
  const results: { window: number; bestParams: P; trainNet: string; testNet: string; testTrades: number }[] = [];
  for (let w = 0; w < windows; w++) {
    const seg = candles.slice(w * size, (w + 1) * size);
    const { inSample, outOfSample } = splitInOut(seg, trainRatio);
    let best = grid[0], bestNet = D(-Infinity);
    for (const p of grid) {
      const r = runBacktest(inSample, strat, p, cfg);
      if (D(r.metrics.netProfit).gt(bestNet)) { bestNet = D(r.metrics.netProfit); best = p; }
    }
    const t = runBacktest(outOfSample, strat, best, cfg);
    results.push({ window: w, bestParams: best, trainNet: bestNet.toFixed(2), testNet: t.metrics.netProfit, testTrades: t.metrics.trades });
  }
  return results;
}
