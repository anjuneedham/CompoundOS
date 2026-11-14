import { describe, it, expect } from "vitest";
import { D } from "@/core/money/decimal";
import { evaluateSignal, positionSize, dailyLossPct, drawdownPct, hardLimitBreaches, type RiskContext } from "@/core/risk/engine";
import { DEFAULT_LIMITS } from "@/core/risk/limits";
import { MOCK_INSTRUMENTS } from "@/core/broker/mock";
import type { Signal } from "@/core/types";

const eur = MOCK_INSTRUMENTS[0];
const sig = (o: Partial<Signal> = {}): Signal => ({ strategyId: "s1", symbol: "EURUSD", side: "buy", entryPrice: D("1.1000"), stopLoss: D("1.0950"), reason: "t", source: "strategy", createdAt: new Date(), ...o });
const ctx = (o: Partial<RiskContext> = {}): RiskContext => ({
  mode: "paper", liveAuthorized: false,
  account: { accountId: "a", currency: "USD", balance: D(10000), equity: D(10000), dayStartEquity: D(10000), peakEquity: D(10000), connected: true, tradingEnabled: true },
  instrument: eur, openPositions: [], instruments: { EURUSD: eur }, limits: { ...DEFAULT_LIMITS }, halts: { global: false, killSwitch: false, haltedStrategies: [] },
  tradesToday: 0, existingIntentKeys: new Set(), intentKey: "k", marketOpen: true, ...o,
});

describe("position sizing", () => {
  it("risks 0.5% of equity, rounded down to step", () => {
    // risk budget = 50; per-unit risk = 0.005 -> 10000 units exactly
    const r = positionSize(D(10000), D("0.5"), D("1.1000"), D("1.0950"), eur);
    expect(r.qty.toString()).toBe("10000"); expect(r.riskAmount.toString()).toBe("50");
  });
  it("rounds down never up", () => {
    const r = positionSize(D(10000), D("0.5"), D("1.1000"), D("1.0930"), eur); // 50/0.007=7142.8 -> 7000
    expect(r.qty.toString()).toBe("7000");
    expect(r.riskAmount.lte(50)).toBe(true);
  });
  it("zero stop distance => zero qty", () => { expect(positionSize(D(1), D(1), D(1), D(1), eur).qty.isZero()).toBe(true); });
});

describe("risk engine", () => {
  it("approves a valid paper signal", () => { const d = evaluateSignal(sig(), ctx()); expect(d.rejectionReasons).toEqual([]); expect(d.approved).toBe(true); });
  it("rejects in research mode", () => { expect(evaluateSignal(sig(), ctx({ mode: "research" })).approved).toBe(false); });
  it("rejects live without authorization", () => { const d = evaluateSignal(sig(), ctx({ mode: "live" })); expect(d.rejectionReasons.some((r) => r.startsWith("live_authorized"))).toBe(true); });
  it("rejects when kill switch active", () => { expect(evaluateSignal(sig(), ctx({ halts: { global: false, killSwitch: true, haltedStrategies: [] } })).approved).toBe(false); });
  it("rejects halted strategy", () => { expect(evaluateSignal(sig(), ctx({ halts: { global: false, killSwitch: false, haltedStrategies: ["s1"] } })).approved).toBe(false); });
  it("rejects invalid stop side", () => { expect(evaluateSignal(sig({ stopLoss: D("1.2") }), ctx()).approved).toBe(false); });
  it("rejects duplicates", () => { expect(evaluateSignal(sig(), ctx({ existingIntentKeys: new Set(["k"]) })).approved).toBe(false); });
  it("rejects when daily loss limit hit", () => {
    const c = ctx(); c.account.equity = D(9800); c.account.balance = D(9800);
    expect(dailyLossPct(c.account).toString()).toBe("2");
    expect(evaluateSignal(sig(), c).approved).toBe(false);
  });
  it("rejects when drawdown limit hit", () => {
    const c = ctx(); c.account.peakEquity = D(10600); c.account.dayStartEquity = D(10000); c.account.equity = D(10000);
    expect(drawdownPct(c.account).toNumber()).toBeGreaterThan(5);
    expect(evaluateSignal(sig(), c).approved).toBe(false);
  });
  it("shrinks size to remaining daily allowance", () => {
    const c = ctx(); c.account.equity = D(9820); // 1.8% lost -> 0.2% left < 0.5%
    const d = evaluateSignal(sig(), c);
    expect(d.riskAmount.lte(D(9820).times("0.002"))).toBe(true);
  });
  it("rejects over max concurrent positions", () => {
    const p = { id: "x", symbol: "GBPUSD", side: "buy" as const, qty: D(1000), entryPrice: D("1.27"), openedAt: new Date() };
    expect(evaluateSignal(sig(), ctx({ openPositions: [p, { ...p, id: "y" }, { ...p, id: "z" }] })).approved).toBe(false);
  });
  it("rejects disallowed instrument", () => { const c = ctx(); c.limits.allowedSymbols = ["GBPUSD"]; expect(evaluateSignal(sig(), c).approved).toBe(false); });
  it("rejects when broker disconnected", () => { const c = ctx(); c.account.connected = false; expect(evaluateSignal(sig(), c).approved).toBe(false); });
  it("hard limit breaches detected", () => {
    const c = ctx(); c.account.equity = D(9400); c.account.peakEquity = D(10000);
    expect(hardLimitBreaches(c.account, c.limits)).toEqual(["daily_loss", "max_drawdown"]);
  });
});
