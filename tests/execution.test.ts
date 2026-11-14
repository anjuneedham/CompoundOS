import { describe, it, expect, beforeEach } from "vitest";
import { D } from "@/core/money/decimal";
import { MockBroker } from "@/core/broker/mock";
import { MemoryStore } from "@/core/execution/store";
import { ExecutionEngine } from "@/core/execution/engine";
import { DEFAULT_LIMITS } from "@/core/risk/limits";
import type { Signal } from "@/core/types";

let broker: MockBroker, store: MemoryStore, engine: ExecutionEngine;
const sig = (o: Partial<Signal> = {}): Signal => ({ strategyId: "s1", symbol: "EURUSD", side: "buy", entryPrice: D("1.1000"), stopLoss: D("1.0950"), reason: "t", source: "strategy", createdAt: new Date("2026-01-01T10:00:00Z"), ...o });
const make = (o: Partial<ExecutionEngine["cfg"]> = {}) => new ExecutionEngine(broker, store, { mode: "paper", liveAuthorized: false, limits: { ...DEFAULT_LIMITS }, halts: { global: false, killSwitch: false, haltedStrategies: [] }, emergencyPolicy: "close_all", ...o }, { dayStartEquity: D(10000), peakEquity: D(10000), tradesToday: 0 });

beforeEach(async () => { broker = new MockBroker(10000); await broker.connect(); store = new MemoryStore(); engine = make(); });

describe("execution simulation", () => {
  it("successful order is filled, recorded and reconciled", async () => {
    const r = await engine.execute(sig());
    expect(r.executed).toBe(true);
    expect(r.intent.status).toBe("filled");
    expect((await broker.getOpenPositions()).length).toBe(1);
    expect(store.tracked.length).toBe(1);
    expect(store.auditLog.map((a) => a.action)).toContain("order_result");
  });
  it("duplicate submissions do not double-execute", async () => {
    await engine.execute(sig()); const r2 = await engine.execute(sig());
    expect(r2.executed).toBe(false); expect(r2.message).toMatch(/duplicate/);
    expect((await broker.getOpenPositions()).length).toBe(1);
  });
  it("broker rejection recorded", async () => {
    broker.faults.rejectNext = "insufficient margin";
    const r = await engine.execute(sig());
    expect(r.executed).toBe(false); expect(r.intent.status).toBe("rejected");
  });
  it("timeout after fill is resolved by lookup, not resubmitted", async () => {
    broker.faults.timeoutAfterFill = true;
    const r = await engine.execute(sig());
    expect(r.executed).toBe(true); expect(r.intent.attempts).toBe(1);
    expect((await broker.getOpenPositions()).length).toBe(1);
  });
  it("network error before fill retries safely", async () => {
    broker.faults.networkErrorNext = true;
    const r = await engine.execute(sig());
    expect(r.executed).toBe(true); expect(r.intent.attempts).toBe(2);
    expect((await broker.getOpenPositions()).length).toBe(1);
  });
  it("partial fill recorded as partially_filled", async () => {
    broker.faults.partialFillRatio = D("0.5");
    const r = await engine.execute(sig());
    expect(r.intent.status).toBe("partially_filled"); expect(r.intent.result!.filledQty.toString()).toBe("5000");
  });
  it("broker disconnect => rejected and monitor halts trading", async () => {
    await broker.disconnect();
    const r = await engine.execute(sig()); expect(r.executed).toBe(false);
    const m = await engine.monitor(); expect(m.breaches).toContain("broker_disconnected"); expect(engine.cfg.halts.global).toBe(true);
  });
  it("risk limit breach halts and closes per policy", async () => {
    await engine.execute(sig());
    broker.setPrice("EURUSD", "1.0400"); // large loss
    const m = await engine.monitor();
    expect(m.breaches).toContain("daily_loss"); expect(m.closed.length).toBe(1);
    expect(engine.cfg.halts.global).toBe(true);
    const after = await engine.execute(sig({ createdAt: new Date("2026-01-01T11:00:00Z") }));
    expect(after.executed).toBe(false);
  });
  it("kill switch with halt_only keeps positions open", async () => {
    engine = make({ emergencyPolicy: "halt_only" });
    await engine.execute(sig());
    expect(await engine.killSwitch()).toEqual([]);
    expect((await broker.getOpenPositions()).length).toBe(1);
    expect((await engine.execute(sig({ createdAt: new Date("2026-01-02T00:00:00Z") }))).executed).toBe(false);
  });
  it("reconciliation flags unexpected external positions", async () => {
    broker.injectExternalPosition({ id: "EXT", symbol: "SYN100", side: "buy", qty: D(1), entryPrice: D(100), openedAt: new Date() });
    const r = await engine.reconcile();
    expect(r.unexpected.map((p) => p.id)).toEqual(["EXT"]);
  });
  it("refuses live mode with a non-live adapter", async () => {
    engine = make({ mode: "live", liveAuthorized: true });
    await expect(engine.execute(sig())).rejects.toThrow(/live broker/);
  });
});
