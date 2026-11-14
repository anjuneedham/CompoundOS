import { createHash } from "node:crypto";
import { D, Decimal } from "../money/decimal";
import type { AccountState, Position, Signal, TradingMode } from "../types";
import { BrokerError, type BrokerAdapter } from "../broker/adapter";
import { evaluateSignal, hardLimitBreaches, type HaltState, type EmergencyPolicy } from "../risk/engine";
import type { RiskLimits } from "../risk/limits";
import type { ExecutionStore, OrderIntent } from "./store";

export interface EngineConfig {
  mode: TradingMode;
  liveAuthorized: boolean;
  limits: RiskLimits;
  halts: HaltState;
  emergencyPolicy: EmergencyPolicy;
  maxSubmitAttempts?: number;
  isMarketOpen?: (symbol: string) => boolean;
}

/** Deterministic idempotency key: same strategy+symbol+side+bar => same key. */
export function intentKey(s: Signal): string {
  const bucket = Math.floor(s.createdAt.getTime() / 60_000); // 1-minute bucket
  return createHash("sha256").update(`${s.strategyId}|${s.symbol}|${s.side}|${s.entryPrice.toString()}|${bucket}`).digest("hex").slice(0, 32);
}

export interface ExecutionOutcome { intent: OrderIntent; executed: boolean; message: string }

export class ExecutionEngine {
  constructor(private broker: BrokerAdapter, private store: ExecutionStore, public cfg: EngineConfig, private dayState: { dayStartEquity: Decimal; peakEquity: Decimal; tradesToday: number }) {}

  async accountState(): Promise<AccountState> {
    const connected = this.broker.isConnected();
    if (!connected) {
      return { accountId: "?", currency: "USD", balance: D(0), equity: D(0), dayStartEquity: this.dayState.dayStartEquity, peakEquity: this.dayState.peakEquity, connected: false, tradingEnabled: false };
    }
    const [acct, balance, equity] = await Promise.all([this.broker.getAccount(), this.broker.getBalance(), this.broker.getEquity()]);
    if (equity.gt(this.dayState.peakEquity)) this.dayState.peakEquity = equity;
    return { accountId: acct.accountId, currency: acct.currency, balance, equity, dayStartEquity: this.dayState.dayStartEquity, peakEquity: this.dayState.peakEquity, connected, tradingEnabled: true };
  }

  /** Execution sequence steps 1-12 (see TRADING_ENGINE.md). */
  async execute(signal: Signal): Promise<ExecutionOutcome> {
    if (this.cfg.mode === "live" && !this.broker.isLive) throw new Error("live mode requires a live broker adapter");
    if (this.cfg.mode !== "live" && this.broker.isLive) throw new Error("refusing to use a live broker outside live mode");

    const key = intentKey(signal);
    // 7. duplicate check against persisted intents first
    const prior = await this.store.getIntent(key);
    if (prior) {
      await this.store.audit("duplicate_signal_ignored", { key });
      return { intent: prior, executed: false, message: "duplicate: intent already exists" };
    }

    // 2-6. validate instrument, account, permissions, size, risk
    const account = await this.accountState();
    const instruments = account.connected ? Object.fromEntries((await this.broker.getMarkets()).map((i) => [i.symbol, i])) : {};
    const open = account.connected ? await this.broker.getOpenPositions() : [];
    const all = await this.store.listIntents();
    const decision = evaluateSignal(signal, {
      mode: this.cfg.mode, liveAuthorized: this.cfg.liveAuthorized, account, instrument: instruments[signal.symbol],
      openPositions: open, instruments, limits: this.cfg.limits, halts: this.cfg.halts, tradesToday: this.dayState.tradesToday,
      existingIntentKeys: new Set(all.map((i) => i.key)), intentKey: key, marketOpen: this.cfg.isMarketOpen?.(signal.symbol) ?? true,
    });

    const now = new Date();
    // 8. create intent (persisted BEFORE submission so a crash can be recovered)
    const intent: OrderIntent = { key, signal, qty: decision.qty, status: decision.approved ? "pending" : "risk_rejected", decision, attempts: 0, createdAt: now, updatedAt: now };
    await this.store.saveIntent(intent);
    await this.store.audit("risk_decision", { key, approved: decision.approved, reasons: decision.rejectionReasons, qty: decision.qty.toString() });
    if (!decision.approved) return { intent, executed: false, message: decision.rejectionReasons.join("; ") };

    const pre = await this.broker.validateOrder({ clientOrderId: key, symbol: signal.symbol, side: signal.side, qty: decision.qty, type: "market" });
    if (!pre.ok) {
      intent.status = "rejected"; await this.store.saveIntent(intent);
      await this.store.audit("broker_validation_failed", { key, reason: pre.reason });
      return { intent, executed: false, message: `broker validation: ${pre.reason}` };
    }

    // 9-10. submit and verify. Never assume success.
    const maxAttempts = this.cfg.maxSubmitAttempts ?? 3;
    while (intent.attempts < maxAttempts) {
      intent.attempts++;
      intent.status = "submitted"; await this.store.saveIntent(intent);
      try {
        const res = await this.broker.placeOrder({ clientOrderId: key, symbol: signal.symbol, side: signal.side, qty: decision.qty, type: "market", stopLoss: signal.stopLoss, takeProfit: signal.takeProfit });
        return await this.record(intent, res);
      } catch (e) {
        const err = e as BrokerError;
        await this.store.audit("submit_error", { key, attempt: intent.attempts, kind: err.kind, message: err.message });
        // Outcome unknown: ask the broker whether the order exists before retrying.
        try {
          const found = await this.broker.getOrderByClientId(key);
          if (found) return await this.record(intent, found);
        } catch { /* broker unreachable; fall through */ }
        if (err.kind === "rejected" || err.kind === "auth" || err.kind === "disconnected") break;
      }
    }
    intent.status = "unknown"; await this.store.saveIntent(intent);
    await this.store.audit("order_outcome_unknown", { key });
    return { intent, executed: false, message: "order outcome unknown; flagged for reconciliation" };
  }

  private async record(intent: OrderIntent, res: NonNullable<OrderIntent["result"]>): Promise<ExecutionOutcome> {
    intent.result = res;
    intent.status = res.status === "filled" ? "filled" : res.status === "partially_filled" ? "partially_filled" : res.status === "rejected" ? "rejected" : "unknown";
    await this.store.saveIntent(intent);
    // 11. record execution
    await this.store.audit("order_result", { key: intent.key, status: res.status, filled: res.filledQty.toString(), price: res.avgPrice?.toString(), fee: res.fee.toString() });
    const executed = intent.status === "filled" || intent.status === "partially_filled";
    if (executed) this.dayState.tradesToday++;
    // 12. reconcile
    await this.reconcile();
    return { intent, executed, message: res.message ?? res.status };
  }

  /** Compare broker positions to tracked positions; broker is the source of truth. */
  async reconcile(): Promise<{ unexpected: Position[]; missing: Position[] }> {
    const broker = await this.broker.getOpenPositions();
    const tracked = await this.store.getTrackedPositions();
    const bIds = new Set(broker.map((p) => p.id)), tIds = new Set(tracked.map((p) => p.id));
    const intentsBySymbol = new Set((await this.store.listIntents()).filter((i) => i.status === "filled" || i.status === "partially_filled").map((i) => i.signal.symbol));
    const unexpected = broker.filter((p) => !tIds.has(p.id) && !intentsBySymbol.has(p.symbol));
    const missing = tracked.filter((p) => !bIds.has(p.id));
    if (unexpected.length || missing.length) await this.store.audit("reconciliation_mismatch", { unexpected: unexpected.map((p) => p.id), missing: missing.map((p) => p.id) });
    await this.store.setTrackedPositions(broker);
    return { unexpected, missing };
  }

  /** Called by the risk monitor job. Breach => halt; optional close per policy. */
  async monitor(): Promise<{ breaches: string[]; closed: string[] }> {
    const a = await this.accountState();
    if (!a.connected) {
      this.cfg.halts.global = true;
      await this.store.audit("broker_disconnected_halt", {});
      return { breaches: ["broker_disconnected"], closed: [] };
    }
    const breaches = hardLimitBreaches(a, this.cfg.limits);
    if (breaches.length) {
      this.cfg.halts.global = true;
      await this.store.audit("hard_limit_breach_halt", { breaches });
      return { breaches, closed: await this.applyEmergencyPolicy() };
    }
    return { breaches, closed: [] };
  }

  async killSwitch(): Promise<string[]> {
    this.cfg.halts.killSwitch = true;
    await this.store.audit("kill_switch_activated", { policy: this.cfg.emergencyPolicy });
    return this.applyEmergencyPolicy();
  }

  private async applyEmergencyPolicy(): Promise<string[]> {
    if (this.cfg.emergencyPolicy === "halt_only") return [];
    const closed: string[] = [];
    for (const p of await this.broker.getOpenPositions()) {
      if (this.cfg.emergencyPolicy === "close_losing") {
        const q = await this.broker.getQuote(p.symbol);
        const mark = p.side === "buy" ? q.bid : q.ask;
        const losing = p.side === "buy" ? mark.lt(p.entryPrice) : mark.gt(p.entryPrice);
        if (!losing) continue;
      }
      try { await this.broker.closePosition(p.id); closed.push(p.id); }
      catch (e) { await this.store.audit("emergency_close_failed", { id: p.id, error: (e as Error).message }); }
    }
    await this.store.audit("emergency_policy_applied", { closed });
    return closed;
  }
}
