// Technical indicators. Each returns an array aligned to input length; entries
// are null until enough data exists (prevents look-ahead: value[i] uses only data[0..i]).
// Indicators are signal-generation math, so plain numbers are acceptable here;
// accounting (balances/P&L) always uses Decimal.

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  if (period <= 0) throw new Error("period must be > 0");
  const out: Series = new Array(values.length).fill(null);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= period) acc -= values[i - period];
    if (i >= period - 1) out[i] = acc / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  if (period <= 0) throw new Error("period must be > 0");
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  const calc = () => (avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast), s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig: Series = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    ema(compact, signal).forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null));
  return { macd: line, signal: sig, histogram: hist };
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }

/** Wilder's ATR. */
export function atr(c: Candle[], period = 14): Series {
  const out: Series = new Array(c.length).fill(null);
  if (c.length <= period) return out;
  const tr = c.map((x, i) =>
    i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)),
  );
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < c.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Series = [], lower: Series = [];
  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null) { upper.push(null); lower.push(null); continue; }
    const w = values.slice(i - period + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, v) => a + (v - mid[i]!) ** 2, 0) / period);
    upper.push(mid[i]! + mult * sd); lower.push(mid[i]! - mult * sd);
  }
  return { middle: mid, upper, lower };
}

/** Cumulative VWAP; requires volume. Returns nulls where volume missing. */
export function vwap(c: Candle[]): Series {
  let pv = 0, vol = 0;
  return c.map((x) => {
    if (x.volume == null || x.volume <= 0) return vol > 0 ? pv / vol : null;
    pv += ((x.high + x.low + x.close) / 3) * x.volume; vol += x.volume;
    return pv / vol;
  });
}
