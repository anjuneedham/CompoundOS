import { describe, it, expect } from "vitest";
import { D } from "@/core/money/decimal";
import { capitalSummary, timeWeightedReturn, maxDrawdownPct, allocationWeights } from "@/core/portfolio/performance";

describe("portfolio accounting", () => {
  it("deposits are never counted as returns", () => {
    const s = capitalSummary([{ type: "deposit", amount: D(1000), at: new Date() }, { type: "deposit", amount: D(500), at: new Date() }], D(1500), D(0));
    expect(s.totalReturn.toString()).toBe("0");
  });
  it("separates gross, fees, net, realized, unrealized", () => {
    const s = capitalSummary([{ type: "deposit", amount: D(1000), at: new Date() }, { type: "realized_pnl", amount: D(50), at: new Date() }, { type: "fee", amount: D(-3), at: new Date() }], D(1057), D(10));
    expect(s.grossProfit.toString()).toBe("50"); expect(s.netProfit.toString()).toBe("47"); expect(s.unrealizedPnl.toString()).toBe("10"); expect(s.totalReturn.toString()).toBe("57");
  });
  it("decimal precision: 0.1+0.2 is exactly 0.3", () => { expect(D("0.1").plus("0.2").toString()).toBe("0.3"); });
  it("TWR neutralizes deposits", () => {
    expect(timeWeightedReturn([{ startValue: D(100), endValue: D(110), flowAtStart: D(0) }, { startValue: D(110), endValue: D(1210), flowAtStart: D(990) }]).toFixed(2)).toBe("21.00");
  });
  it("drawdown and weights", () => {
    expect(maxDrawdownPct([D(100), D(120), D(90), D(130)]).toString()).toBe("25");
    expect(allocationWeights([{ symbol: "A", value: D(75) }], D(25)).map((w) => w.weightPct.toString())).toEqual(["75", "25"]);
  });
});
