import { z } from "zod";
import { createHash } from "node:crypto";
import { D } from "../money/decimal";
import type { Signal } from "../types";
import { CAPABILITIES, type Capability, TradeProposal } from "./schemas";

/** Transport abstraction so tests can mock Claude and the app can swap providers. */
export interface LlmTransport {
  complete(req: { system: string; user: string; jsonSchema: Record<string, unknown>; maxTokens: number }): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string; stopReason: string | null }>;
}

export interface AiLogSink {
  record(entry: { capability: Capability; inputHash: string; ok: boolean; output?: unknown; error?: string; inputTokens: number; outputTokens: number; model: string; cached: boolean }): Promise<void>;
}

export interface OrchestratorOptions { maxTokens?: number; cacheTtlMs?: number; now?: () => number }

/**
 * Central AI orchestration. One service, multiple capabilities. Output is ALWAYS
 * schema-validated; nothing here can submit orders.
 */
export class AiOrchestrator {
  private cache = new Map<string, { at: number; value: unknown }>();
  constructor(private transport: LlmTransport | null, private log: AiLogSink, private opts: OrchestratorOptions = {}) {}

  get available() { return this.transport !== null; }

  async run<C extends Capability>(capability: C, input: Record<string, unknown>): Promise<{ ok: true; data: z.infer<(typeof CAPABILITIES)[C]["schema"]>; cached: boolean } | { ok: false; error: string }> {
    const cap = CAPABILITIES[capability];
    const user = JSON.stringify(input);
    const inputHash = createHash("sha256").update(capability + user).digest("hex");
    const now = (this.opts.now ?? Date.now)();
    const hit = this.cache.get(inputHash);
    if (hit && now - hit.at < (this.opts.cacheTtlMs ?? 15 * 60_000)) {
      await this.log.record({ capability, inputHash, ok: true, output: hit.value, inputTokens: 0, outputTokens: 0, model: "cache", cached: true });
      return { ok: true, data: hit.value as never, cached: true };
    }
    if (!this.transport) return { ok: false, error: "AI unavailable: ANTHROPIC_API_KEY not configured" };
    let res;
    try {
      res = await this.transport.complete({ system: cap.system, user, jsonSchema: z.toJSONSchema(cap.schema) as Record<string, unknown>, maxTokens: this.opts.maxTokens ?? 4000 });
    } catch (e) {
      const error = `AI request failed: ${(e as Error).message}`;
      await this.log.record({ capability, inputHash, ok: false, error, inputTokens: 0, outputTokens: 0, model: "?", cached: false });
      return { ok: false, error };
    }
    const base = { capability, inputHash, inputTokens: res.inputTokens, outputTokens: res.outputTokens, model: res.model, cached: false };
    if (res.stopReason === "refusal" || res.stopReason === "max_tokens") {
      await this.log.record({ ...base, ok: false, error: `stop_reason=${res.stopReason}` });
      return { ok: false, error: `AI stopped: ${res.stopReason}` };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(res.text); } catch { await this.log.record({ ...base, ok: false, error: "invalid JSON" }); return { ok: false, error: "invalid JSON from AI" }; }
    const v = cap.schema.safeParse(parsed);
    if (!v.success) {
      await this.log.record({ ...base, ok: false, output: parsed, error: v.error.message });
      return { ok: false, error: `schema validation failed: ${v.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` };
    }
    this.cache.set(inputHash, { at: now, value: v.data });
    await this.log.record({ ...base, ok: true, output: v.data });
    return { ok: true, data: v.data as never, cached: false };
  }
}

/** Convert a validated AI proposal into an engine Signal. Returns null with reason if incomplete. */
export function proposalToSignal(p: TradeProposal, now = new Date()): { signal: Signal | null; reason?: string } {
  if (p.action === "no_trade") return { signal: null, reason: "AI proposed no trade" };
  if (!p.side || p.entryPrice == null || p.stopLoss == null) return { signal: null, reason: "proposal missing side/entry/stop" };
  return {
    signal: {
      strategyId: "ai_proposal", symbol: p.symbol, side: p.side, entryPrice: D(p.entryPrice), stopLoss: D(p.stopLoss),
      takeProfit: p.takeProfit != null ? D(p.takeProfit) : undefined, reason: p.rationale, source: "ai", createdAt: now,
    },
  };
}
