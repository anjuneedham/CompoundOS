import { describe, it, expect } from "vitest";
import { AiOrchestrator, proposalToSignal, type LlmTransport, type AiLogSink } from "@/core/ai/orchestrator";

const logs: unknown[] = [];
const sink: AiLogSink = { record: async (e) => { logs.push(e); } };
const t = (text: string, stopReason = "end_turn"): LlmTransport => ({ complete: async () => ({ text, inputTokens: 10, outputTokens: 5, model: "mock", stopReason }) });
const good = JSON.stringify({ action: "propose_trade", symbol: "EURUSD", side: "buy", entryPrice: 1.1, stopLoss: 1.095, takeProfit: 1.11, rationale: "x", confidence: 0.6 });

describe("AI orchestrator (mocked Claude)", () => {
  it("validates and returns structured output", async () => {
    const r = await new AiOrchestrator(t(good), sink).run("trade_proposer", { a: 1 });
    expect(r.ok).toBe(true);
  });
  it("rejects schema-invalid output", async () => {
    const r = await new AiOrchestrator(t(JSON.stringify({ action: "yolo" })), sink).run("trade_proposer", {});
    expect(r.ok).toBe(false);
  });
  it("rejects non-JSON and refusals", async () => {
    expect((await new AiOrchestrator(t("hello"), sink).run("trade_proposer", {})).ok).toBe(false);
    expect((await new AiOrchestrator(t(good, "refusal"), sink).run("trade_proposer", {})).ok).toBe(false);
  });
  it("caches identical requests", async () => {
    let calls = 0;
    const tr: LlmTransport = { complete: async () => { calls++; return { text: good, inputTokens: 1, outputTokens: 1, model: "m", stopReason: "end_turn" }; } };
    const o = new AiOrchestrator(tr, sink);
    await o.run("trade_proposer", { x: 1 }); const r = await o.run("trade_proposer", { x: 1 });
    expect(calls).toBe(1); expect(r.ok && r.cached).toBe(true);
  });
  it("unavailable when no transport", async () => { expect((await new AiOrchestrator(null, sink).run("market_analyst", {})).ok).toBe(false); });
  it("proposal without stop is not converted to a signal", () => {
    expect(proposalToSignal({ action: "propose_trade", symbol: "EURUSD", side: "buy", entryPrice: 1, stopLoss: null, takeProfit: null, rationale: "", confidence: 1 }).signal).toBeNull();
  });
});
