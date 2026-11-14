import { D, Decimal, ZERO } from "../money/decimal";
import type { Candle } from "../indicators";
import type { Instrument, Position } from "../types";
import { BrokerError, type BrokerAdapter, type OrderRequest, type OrderResult, type Quote } from "./adapter";

/**
 * Deterministic simulated broker for paper trading and tests.
 * Supports fault injection: timeouts that still fill, rejections, partial fills, disconnects.
 */
export interface MockFaults {
  /** Throw a timeout AFTER recording the fill (simulates lost confirmation). */
  timeoutAfterFill?: boolean;
  rejectNext?: string;
  partialFillRatio?: Decimal;
  networkErrorNext?: boolean;
}

export const MOCK_INSTRUMENTS: Instrument[] = [
  { symbol: "EURUSD", assetClass: "forex", contractSize: D(1), minQty: D(1000), qtyStep: D(1000), correlationGroup: "USD" },
  { symbol: "GBPUSD", assetClass: "forex", contractSize: D(1), minQty: D(1000), qtyStep: D(1000), correlationGroup: "USD" },
  { symbol: "SYN100", assetClass: "synthetic", contractSize: D(1), minQty: D("0.01"), qtyStep: D("0.01") },
];

/** Seeded PRNG (mulberry32) so simulated prices are reproducible. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(start: number, n: number, seed = 1, stepMs = 3_600_000, vol = 0.002): Candle[] {
  const r = rng(seed); let price = start; const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 50) * vol * 0.3;
    const open = price;
    const close = open * (1 + drift + (r() - 0.5) * vol * 2);
    const high = Math.max(open, close) * (1 + r() * vol);
    const low = Math.min(open, close) * (1 - r() * vol);
    out.push({ time: i * stepMs, open, high, low, close, volume: 1000 + Math.floor(r() * 500) });
    price = close;
  }
  return out;
}

export class MockBroker implements BrokerAdapter {
  readonly id = "mock";
  readonly isLive = false;
  private connected = false;
  private balance: Decimal;
  private positions = new Map<string, Position>();
  private orders = new Map<string, OrderResult>();
  private prices = new Map<string, Decimal>();
  private seq = 0;
  faults: MockFaults = {};
  spread = D("0.0001");
  feePerUnit = D("0.00002");

  constructor(startingBalance: Decimal.Value = 10000, initialPrices: Record<string, Decimal.Value> = { EURUSD: "1.1000", GBPUSD: "1.2700", SYN100: "100" }) {
    this.balance = D(startingBalance);
    for (const [k, v] of Object.entries(initialPrices)) this.prices.set(k, D(v));
  }

  setPrice(symbol: string, p: Decimal.Value) { this.prices.set(symbol, D(p)); }
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }
  isConnected() { return this.connected; }
  private ensure() { if (!this.connected) throw new BrokerError("not connected", "disconnected"); }

  async getAccount() { this.ensure(); return { accountId: "MOCK-PAPER-001", currency: "USD" }; }
  async getBalance() { this.ensure(); return this.balance; }
  async getEquity() {
    this.ensure();
    let eq = this.balance;
    for (const p of this.positions.values()) eq = eq.plus(this.unrealized(p));
    return eq;
  }
  unrealized(p: Position) {
    const mid = this.prices.get(p.symbol) ?? p.entryPrice;
    const inst = MOCK_INSTRUMENTS.find((i) => i.symbol === p.symbol)!;
    const diff = p.side === "buy" ? mid.minus(p.entryPrice) : p.entryPrice.minus(mid);
    return diff.times(p.qty).times(inst.contractSize);
  }
  async getMarkets() { return MOCK_INSTRUMENTS; }
  async getMarketData(symbol: string, limit: number) {
    const base = this.prices.get(symbol)?.toNumber() ?? 1;
    return generateCandles(base, limit, symbol.length * 7);
  }
  async getQuote(symbol: string): Promise<Quote> {
    this.ensure();
    const mid = this.prices.get(symbol);
    if (!mid) throw new BrokerError(`unknown symbol ${symbol}`, "rejected");
    const half = this.spread.div(2);
    return { symbol, bid: mid.minus(half), ask: mid.plus(half), time: new Date() };
  }
  async getOpenPositions() { this.ensure(); return [...this.positions.values()]; }
  async getOrderHistory() { return [...this.orders.values()]; }
  async getOrderByClientId(id: string) { this.ensure(); return this.orders.get(id) ?? null; }

  async validateOrder(o: OrderRequest) {
    const inst = MOCK_INSTRUMENTS.find((i) => i.symbol === o.symbol);
    if (!inst) return { ok: false, reason: "unknown instrument" };
    if (o.qty.lt(inst.minQty)) return { ok: false, reason: "below min qty" };
    if (!o.qty.mod(inst.qtyStep).isZero()) return { ok: false, reason: "qty not multiple of step" };
    return { ok: true };
  }

  async placeOrder(o: OrderRequest): Promise<OrderResult> {
    this.ensure();
    if (this.faults.networkErrorNext) { this.faults.networkErrorNext = false; throw new BrokerError("ECONNRESET", "network"); }
    // Broker-side idempotency: same clientOrderId returns the original result.
    const existing = this.orders.get(o.clientOrderId);
    if (existing) return existing;
    const v = await this.validateOrder(o);
    if (!v.ok || this.faults.rejectNext) {
      const res: OrderResult = { clientOrderId: o.clientOrderId, status: "rejected", filledQty: ZERO, fee: ZERO, message: this.faults.rejectNext ?? v.reason };
      this.faults.rejectNext = undefined;
      this.orders.set(o.clientOrderId, res);
      return res;
    }
    const q = await this.getQuote(o.symbol);
    const price = o.side === "buy" ? q.ask : q.bid;
    const ratio = this.faults.partialFillRatio;
    const inst = MOCK_INSTRUMENTS.find((i) => i.symbol === o.symbol)!;
    const filled = ratio ? o.qty.times(ratio).div(inst.qtyStep).floor().times(inst.qtyStep) : o.qty;
    const fee = filled.times(this.feePerUnit);
    this.balance = this.balance.minus(fee);
    const brokerOrderId = `MO-${++this.seq}`;
    const posId = `MP-${this.seq}`;
    this.positions.set(posId, { id: posId, symbol: o.symbol, side: o.side, qty: filled, entryPrice: price, stopLoss: o.stopLoss, takeProfit: o.takeProfit, openedAt: new Date() });
    const res: OrderResult = { clientOrderId: o.clientOrderId, brokerOrderId, status: filled.eq(o.qty) ? "filled" : "partially_filled", filledQty: filled, avgPrice: price, fee };
    this.orders.set(o.clientOrderId, res);
    if (this.faults.timeoutAfterFill) { this.faults.timeoutAfterFill = false; throw new BrokerError("timeout awaiting confirmation", "timeout"); }
    return res;
  }

  async closePosition(positionId: string): Promise<OrderResult> {
    this.ensure();
    const p = this.positions.get(positionId);
    if (!p) throw new BrokerError("position not found", "rejected");
    const q = await this.getQuote(p.symbol);
    const exit = p.side === "buy" ? q.bid : q.ask;
    const inst = MOCK_INSTRUMENTS.find((i) => i.symbol === p.symbol)!;
    const pnl = (p.side === "buy" ? exit.minus(p.entryPrice) : p.entryPrice.minus(exit)).times(p.qty).times(inst.contractSize);
    const fee = p.qty.times(this.feePerUnit);
    this.balance = this.balance.plus(pnl).minus(fee);
    this.positions.delete(positionId);
    const res: OrderResult = { clientOrderId: `close-${positionId}`, brokerOrderId: `MC-${++this.seq}`, status: "filled", filledQty: p.qty, avgPrice: exit, fee };
    this.orders.set(res.clientOrderId, res);
    return res;
  }

  /** Serialize for persistence between stateless serverless invocations. */
  exportState() {
    const ser = (p: Position) => ({ ...p, qty: p.qty.toString(), entryPrice: p.entryPrice.toString(), stopLoss: p.stopLoss?.toString(), takeProfit: p.takeProfit?.toString(), openedAt: p.openedAt.toISOString() });
    return { balance: this.balance.toString(), seq: this.seq, positions: [...this.positions.values()].map(ser), orderIds: [...this.orders.keys()].slice(-500) };
  }
  importState(s: ReturnType<MockBroker["exportState"]>) {
    this.balance = D(s.balance); this.seq = s.seq;
    this.positions = new Map(s.positions.map((p) => [p.id, { ...p, qty: D(p.qty), entryPrice: D(p.entryPrice), stopLoss: p.stopLoss ? D(p.stopLoss) : undefined, takeProfit: p.takeProfit ? D(p.takeProfit) : undefined, openedAt: new Date(p.openedAt) }]));
    for (const id of s.orderIds) if (!this.orders.has(id)) this.orders.set(id, { clientOrderId: id, status: "filled", filledQty: ZERO, fee: ZERO, message: "historical" });
  }

  /** Close positions whose stop/target was touched by the latest bar. Returns closures. */
  async processStopsAndTargets(bars: Record<string, { high: number; low: number }>) {
    const closed: { position: Position; result: OrderResult; pnl: Decimal; reason: "stop" | "target" }[] = [];
    for (const p of [...this.positions.values()]) {
      const b = bars[p.symbol]; if (!b) continue;
      const hitStop = p.stopLoss && (p.side === "buy" ? b.low <= p.stopLoss.toNumber() : b.high >= p.stopLoss.toNumber());
      const hitTgt = p.takeProfit && (p.side === "buy" ? b.high >= p.takeProfit.toNumber() : b.low <= p.takeProfit.toNumber());
      if (!hitStop && !hitTgt) continue;
      const before = this.balance;
      this.setPrice(p.symbol, (hitStop ? p.stopLoss! : p.takeProfit!).toString()); // conservative: stop first
      const result = await this.closePosition(p.id);
      closed.push({ position: p, result, pnl: this.balance.minus(before), reason: hitStop ? "stop" : "target" });
    }
    return closed;
  }

  /** Test hook: simulate a position appearing/disappearing outside our system. */
  injectExternalPosition(p: Position) { this.positions.set(p.id, p); }
}
