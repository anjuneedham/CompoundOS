import Decimal from "decimal.js";

// All financial arithmetic uses decimal.js. Never use JS floats for accounting.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;
export const D = (v: Decimal.Value): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);
export { Decimal };

export function sum(values: Decimal[]): Decimal {
  return values.reduce((a, b) => a.plus(b), ZERO);
}
export function toFixedStr(v: Decimal, dp = 2): string {
  return v.toFixed(dp);
}
