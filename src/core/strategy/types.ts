import type { Candle } from "../indicators";
import { sma, rsi, atr } from "../indicators";

/**
 * Strategies are pure functions over historical candles. They NEVER submit orders;
 * they emit entry intents that flow through the risk + execution engines.
 * evaluate(candles, i) may only read candles[0..i] (no look-ahead).
 */
export interface StrategyEntry { side: "buy" | "sell"; stopDistance: number; takeProfitDistance?: number; reason: string }

export interface StrategyDefinition<P = Record<string, number>> {
  kind: string;
  description: string;
  defaults: P;
  warmup(p: P): number;
  evaluate(candles: Candle[], i: number, p: P): StrategyEntry | null;
}

export const smaCrossover: StrategyDefinition<{ fast: number; slow: number; atrPeriod: number; atrStopMult: number; rr: number }> = {
  kind: "sma_crossover",
  description: "Fast/slow SMA crossover with ATR stop and fixed reward:risk target.",
  defaults: { fast: 10, slow: 30, atrPeriod: 14, atrStopMult: 2, rr: 2 },
  warmup: (p) => Math.max(p.slow, p.atrPeriod) + 1,
  evaluate(c, i, p) {
    const closes = c.slice(0, i + 1).map((x) => x.close);
    const f = sma(closes, p.fast), s = sma(closes, p.slow), a = atr(c.slice(0, i + 1), p.atrPeriod);
    const [f0, f1, s0, s1, at] = [f[i - 1], f[i], s[i - 1], s[i], a[i]];
    if (f0 == null || f1 == null || s0 == null || s1 == null || at == null) return null;
    const stop = at * p.atrStopMult;
    if (f0 <= s0 && f1 > s1) return { side: "buy", stopDistance: stop, takeProfitDistance: stop * p.rr, reason: "fast SMA crossed above slow" };
    if (f0 >= s0 && f1 < s1) return { side: "sell", stopDistance: stop, takeProfitDistance: stop * p.rr, reason: "fast SMA crossed below slow" };
    return null;
  },
};

export const rsiReversion: StrategyDefinition<{ period: number; low: number; high: number; atrPeriod: number; atrStopMult: number; rr: number }> = {
  kind: "rsi_reversion",
  description: "Mean reversion: buy when RSI crosses up through oversold, sell when crossing down through overbought.",
  defaults: { period: 14, low: 30, high: 70, atrPeriod: 14, atrStopMult: 1.5, rr: 1.5 },
  warmup: (p) => Math.max(p.period, p.atrPeriod) + 2,
  evaluate(c, i, p) {
    const closes = c.slice(0, i + 1).map((x) => x.close);
    const r = rsi(closes, p.period), a = atr(c.slice(0, i + 1), p.atrPeriod);
    const [r0, r1, at] = [r[i - 1], r[i], a[i]];
    if (r0 == null || r1 == null || at == null) return null;
    const stop = at * p.atrStopMult;
    if (r0 < p.low && r1 >= p.low) return { side: "buy", stopDistance: stop, takeProfitDistance: stop * p.rr, reason: `RSI crossed up through ${p.low}` };
    if (r0 > p.high && r1 <= p.high) return { side: "sell", stopDistance: stop, takeProfitDistance: stop * p.rr, reason: `RSI crossed down through ${p.high}` };
    return null;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const STRATEGIES: Record<string, StrategyDefinition<any>> = { [smaCrossover.kind]: smaCrossover, [rsiReversion.kind]: rsiReversion };
