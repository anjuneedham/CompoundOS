import { describe, it, expect } from "vitest";
import { D } from "@/core/money/decimal";
import { generateCandles } from "@/core/broker/mock";
import { runBacktest, walkForward, splitInOut } from "@/core/backtest/engine";
import { smaCrossover, rsiReversion } from "@/core/strategy/types";

const candles = generateCandles(1.1, 1500, 42);
const cfg = { startingEquity: 10000, riskPct: "0.5", spread: "0.0001", slippage: "0.00002", feePerUnit: "0.00002", qtyStep: 1000 };

describe("backtest", () => {
  it("is deterministic", () => {
    const a = runBacktest(candles, smaCrossover, smaCrossover.defaults, cfg), b = runBacktest(candles, smaCrossover, smaCrossover.defaults, cfg);
    expect(a.metrics).toEqual(b.metrics);
  });
  it("equity accounting reconciles: start + sum(pnl) = end", () => {
    const r = runBacktest(candles, rsiReversion, rsiReversion.defaults, cfg);
    expect(r.metrics.trades).toBeGreaterThan(0);
    const total = r.trades.reduce((a, t) => a.plus(t.pnl), D(0));
    expect(D(10000).plus(total).toFixed(0)).toBe(D(r.metrics.endingEquity).toFixed(0));
  });
  it("costs reduce performance", () => {
    const free = runBacktest(candles, smaCrossover, smaCrossover.defaults, { ...cfg, spread: 0, slippage: 0, feePerUnit: 0 });
    const costly = runBacktest(candles, smaCrossover, smaCrossover.defaults, cfg);
    expect(D(costly.metrics.netProfit).lt(free.metrics.netProfit)).toBe(true);
  });
  it("no look-ahead: truncating future bars does not change past trades", () => {
    const full = runBacktest(candles, smaCrossover, smaCrossover.defaults, cfg);
    const part = runBacktest(candles.slice(0, 1000), smaCrossover, smaCrossover.defaults, cfg);
    const closedBefore = full.trades.filter((t) => t.exitIndex < 990);
    expect(part.trades.slice(0, closedBefore.length)).toEqual(closedBefore);
  });
  it("walk-forward and split", () => {
    expect(splitInOut([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.7).outOfSample).toEqual([8, 9, 10]);
    const wf = walkForward(candles, smaCrossover, [smaCrossover.defaults, { ...smaCrossover.defaults, fast: 5, slow: 20 }], cfg, 3);
    expect(wf.length).toBe(3);
  });
});
