import { generateCandles } from "../broker/mock";
import type { Candle } from "../indicators";

/**
 * SIMULATED market data feed (clearly labelled in UI). Deterministic hourly candles
 * from a fixed epoch so every serverless invocation sees the same history.
 * Replace with a real broker/data-vendor feed when one is verified.
 */
export const SIM_EPOCH = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const BASE: Record<string, { price: number; vol: number; seed: number }> = {
  EURUSD: { price: 1.1, vol: 0.0015, seed: 11 },
  GBPUSD: { price: 1.27, vol: 0.0018, seed: 23 },
  SYN100: { price: 100, vol: 0.004, seed: 37 },
};
export const SIM_SYMBOLS = Object.keys(BASE);
const cache = new Map<string, Candle[]>();

export function simulatedCandles(symbol: string, now = Date.now(), limit = 500): Candle[] {
  const b = BASE[symbol];
  if (!b) throw new Error(`no simulated feed for ${symbol}`);
  const bars = Math.max(1, Math.floor((now - SIM_EPOCH) / HOUR));
  const key = `${symbol}:${bars}`;
  let all = cache.get(key);
  if (!all) {
    all = generateCandles(b.price, bars, b.seed, HOUR, b.vol).map((c) => ({ ...c, time: SIM_EPOCH + c.time }));
    cache.clear(); cache.set(key, all);
  }
  return all.slice(-limit);
}
