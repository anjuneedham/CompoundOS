import type { Decimal } from "../money/decimal";
import type { Candle } from "../indicators";
import type { Instrument, Position, Side } from "../types";

export interface OrderRequest {
  clientOrderId: string; // idempotency key
  symbol: string;
  side: Side;
  qty: Decimal;
  type: "market";
  stopLoss?: Decimal;
  takeProfit?: Decimal;
}

export type OrderStatus = "accepted" | "filled" | "partially_filled" | "rejected" | "unknown";

export interface OrderResult {
  clientOrderId: string;
  brokerOrderId?: string;
  status: OrderStatus;
  filledQty: Decimal;
  avgPrice?: Decimal;
  fee: Decimal;
  message?: string;
}

export interface Quote { symbol: string; bid: Decimal; ask: Decimal; time: Date }

export class BrokerError extends Error {
  constructor(message: string, public kind: "network" | "timeout" | "rate_limit" | "auth" | "rejected" | "disconnected") {
    super(message);
  }
}

/** Common interface every broker integration must implement. */
export interface BrokerAdapter {
  readonly id: string;
  readonly isLive: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getAccount(): Promise<{ accountId: string; currency: string }>;
  getBalance(): Promise<Decimal>;
  getEquity(): Promise<Decimal>;
  getMarkets(): Promise<Instrument[]>;
  getMarketData(symbol: string, limit: number): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote>;
  getOpenPositions(): Promise<Position[]>;
  getOrderHistory(): Promise<OrderResult[]>;
  /** Look up an order by our idempotency key (used to resolve 'unknown' outcomes). */
  getOrderByClientId(clientOrderId: string): Promise<OrderResult | null>;
  validateOrder(o: OrderRequest): Promise<{ ok: boolean; reason?: string }>;
  placeOrder(o: OrderRequest): Promise<OrderResult>;
  closePosition(positionId: string): Promise<OrderResult>;
}
