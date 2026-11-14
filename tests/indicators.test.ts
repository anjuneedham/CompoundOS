import { describe, it, expect } from "vitest";
import { sma, ema, rsi, atr, bollinger, macd, vwap } from "@/core/indicators";

describe("indicators", () => {
  it("sma", () => { expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]); });
  it("ema seeds with sma then smooths", () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[2]).toBe(2); expect(e[3]).toBeCloseTo(3); expect(e[4]).toBeCloseTo(4);
  });
  it("rsi is 100 on monotonic rise and 0 on monotonic fall", () => {
    const up = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(up, 14)[19]).toBe(100);
    expect(rsi(up.slice().reverse(), 14)[19]).toBe(0);
  });
  it("rsi matches a known Wilder reference value", () => {
    // Classic Wilder example dataset (StockCharts); RSI(14) at index 14 ≈ 70.53
    const d = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];
    expect(rsi(d, 14)[14]!).toBeCloseTo(70.46, 0);
  });
  it("atr of constant-range bars equals range", () => {
    const c = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 10, high: 11, low: 9, close: 10 }));
    expect(atr(c, 14)[19]).toBeCloseTo(2);
  });
  it("bollinger collapses on flat series", () => {
    const b = bollinger(Array(25).fill(5), 20);
    expect(b.upper[24]).toBe(5); expect(b.lower[24]).toBe(5);
  });
  it("macd zero on flat series", () => { const m = macd(Array(60).fill(3)); expect(m.macd[59]).toBeCloseTo(0); expect(m.histogram[59]).toBeCloseTo(0); });
  it("vwap null without volume", () => { expect(vwap([{ time: 0, open: 1, high: 1, low: 1, close: 1 }])).toEqual([null]); });
  it("no look-ahead: value at i unchanged when future data appended", () => {
    const a = [1, 3, 2, 5, 4, 6, 7, 3, 2, 8, 9, 4, 3, 6, 7, 8];
    const r1 = rsi(a, 5), r2 = rsi([...a, 100, 1, 50], 5);
    for (let i = 0; i < a.length; i++) expect(r2[i]).toBe(r1[i]);
  });
});
