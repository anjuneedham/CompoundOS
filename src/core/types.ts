import type { Decimal } from "./money/decimal";

export type TradingMode = "research" | "paper" | "live";
export type Side = "buy" | "sell";

export interface Instrument {
  symbol: string;
  assetClass: "forex" | "synthetic" | "stock" | "etf" | "crypto";
  /** Value of a 1.0 price move for 1 unit of quantity, in account currency. */
  contractSize: Decimal;
  minQty: Decimal;
  qtyStep: Decimal;
  /** Correlation group for aggregate exposure limits, e.g. "USD". */
  correlationGroup?: string;
}

export interface Signal {
  strategyId: string;
  symbol: string;
  side: Side;
  entryPrice: Decimal;
  stopLoss: Decimal;
  takeProfit?: Decimal;
  reason: string;
  source: "strategy" | "ai";
  createdAt: Date;
}

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  qty: Decimal;
  entryPrice: Decimal;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  strategyId?: string;
  openedAt: Date;
}

export interface AccountState {
  accountId: string;
  currency: string;
  balance: Decimal;
  equity: Decimal;
  /** Equity at start of trading day (for daily loss). */
  dayStartEquity: Decimal;
  /** Highest equity watermark (for drawdown). */
  peakEquity: Decimal;
  connected: boolean;
  tradingEnabled: boolean;
}
