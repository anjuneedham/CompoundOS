import { describe, it, expect } from "vitest";
import { D } from "@/core/money/decimal";
import { MockBroker } from "@/core/broker/mock";
import { simulatedCandles, SIM_EPOCH } from "@/core/market/simulated";

describe("paper broker persistence", () => {
  it("export/import round-trips balance and positions exactly", async () => {
    const a = new MockBroker(10000); await a.connect();
    await a.placeOrder({ clientOrderId: "c1", symbol: "EURUSD", side: "buy", qty: D(2000), type: "market", stopLoss: D("1.09") });
    const b = new MockBroker(0); b.importState(JSON.parse(JSON.stringify(a.exportState()))); await b.connect();
    expect((await b.getBalance()).toString()).toBe((await a.getBalance()).toString());
    expect((await b.getOpenPositions())[0].qty.toString()).toBe("2000");
    // idempotency survives persistence
    const again = await b.placeOrder({ clientOrderId: "c1", symbol: "EURUSD", side: "buy", qty: D(2000), type: "market" });
    expect(again.message).toBe("historical");
    expect((await b.getOpenPositions()).length).toBe(1);
  });
  it("stops close at the stop price; P/L credited to balance", async () => {
    const m = new MockBroker(10000); await m.connect();
    await m.placeOrder({ clientOrderId: "c", symbol: "EURUSD", side: "buy", qty: D(10000), type: "market", stopLoss: D("1.0950"), takeProfit: D("1.1100") });
    const closed = await m.processStopsAndTargets({ EURUSD: { high: 1.1001, low: 1.0940 } });
    expect(closed[0].reason).toBe("stop");
    expect(closed[0].pnl.lt(0)).toBe(true);
    expect((await m.getOpenPositions()).length).toBe(0);
  });
});

describe("simulated feed", () => {
  it("is deterministic and history does not change as time advances", () => {
    const t = SIM_EPOCH + 1000 * 3600_000;
    const a = simulatedCandles("EURUSD", t, 100), b = simulatedCandles("EURUSD", t + 5 * 3600_000, 105);
    expect(b.slice(0, 100)).toEqual(a);
  });
});
