import { D, Decimal, ZERO, sum } from "../money/decimal";

export type TxType = "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "fee" | "realized_pnl";
export interface Tx { type: TxType; amount: Decimal; at: Date }

/**
 * Capital accounting. Deposits/withdrawals are external flows and are NEVER
 * counted as returns. Return = equity change minus net external flows.
 */
export function capitalSummary(txs: Tx[], currentEquity: Decimal, unrealized: Decimal) {
  const by = (t: TxType) => sum(txs.filter((x) => x.type === t).map((x) => x.amount.abs()));
  const deposits = by("deposit"), withdrawals = by("withdrawal"), fees = by("fee"), dividends = by("dividend");
  const realized = sum(txs.filter((x) => x.type === "realized_pnl").map((x) => x.amount));
  const netContributions = deposits.minus(withdrawals);
  const grossProfit = realized.plus(dividends);
  const netProfit = grossProfit.minus(fees);
  const totalReturn = currentEquity.minus(netContributions);
  return {
    deposits, withdrawals, netContributions, fees, dividends,
    realizedPnl: realized, unrealizedPnl: unrealized, grossProfit, netProfit, totalReturn,
    totalReturnPct: netContributions.isZero() ? ZERO : totalReturn.div(netContributions).times(100),
  };
}

/** Time-weighted return across sub-periods split at external flows. */
export function timeWeightedReturn(periods: { startValue: Decimal; endValue: Decimal; flowAtStart: Decimal }[]) {
  let g = D(1);
  for (const p of periods) {
    const base = p.startValue.plus(p.flowAtStart);
    if (base.isZero()) continue;
    g = g.times(p.endValue.div(base));
  }
  return g.minus(1).times(100);
}

export function maxDrawdownPct(equity: Decimal[]) {
  let peak = ZERO, mdd = ZERO;
  for (const e of equity) { if (e.gt(peak)) peak = e; if (peak.gt(0)) { const d = peak.minus(e).div(peak).times(100); if (d.gt(mdd)) mdd = d; } }
  return mdd;
}

export function allocationWeights(holdings: { symbol: string; value: Decimal }[], cash: Decimal) {
  const total = sum(holdings.map((h) => h.value)).plus(cash);
  if (total.isZero()) return [];
  return [...holdings.map((h) => ({ symbol: h.symbol, weightPct: h.value.div(total).times(100) })), { symbol: "CASH", weightPct: cash.div(total).times(100) }];
}

export type { Decimal };
