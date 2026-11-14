import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutionStore, OrderIntent } from "@/core/execution/store";
import type { Position, TradingMode } from "@/core/types";

/**
 * Supabase-backed ExecutionStore. Intents are upserted by (user_id, idempotency_key),
 * so a re-run of the same bar cannot create a second order (DB-level idempotency).
 */
export class SupabaseExecutionStore implements ExecutionStore {
  private intents = new Map<string, OrderIntent>();
  private tracked: Position[] = [];
  constructor(private db: SupabaseClient, private userId: string, private mode: TradingMode) {}

  async preload(sinceHours = 48) {
    const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
    const { data } = await this.db.from("trade_orders").select("idempotency_key,status,symbol,side,qty,created_at").eq("user_id", this.userId).gte("created_at", since);
    for (const r of data ?? []) this.intents.set(r.idempotency_key, { key: r.idempotency_key, status: r.status, persisted: true } as unknown as OrderIntent);
    const { data: pos } = await this.db.from("open_positions").select("*").eq("user_id", this.userId).eq("mode", this.mode);
    this.tracked = (pos ?? []).map((p) => ({ id: p.broker_position_id, symbol: p.symbol, side: p.side, qty: p.qty, entryPrice: p.entry_price, openedAt: new Date(p.opened_at) })) as unknown as Position[];
  }
  async getIntent(k: string) { return this.intents.get(k); }
  async listIntents() { return [...this.intents.values()].filter((i) => i.signal); }
  async saveIntent(i: OrderIntent) {
    this.intents.set(i.key, i);
    const { error } = await this.db.from("trade_orders").upsert({
      user_id: this.userId, idempotency_key: i.key, mode: this.mode, symbol: i.signal.symbol, side: i.signal.side, qty: i.qty.toString(),
      status: i.status, risk_checks: i.decision.checks, rejection_reasons: i.decision.rejectionReasons, broker_order_id: i.result?.brokerOrderId ?? null, attempts: i.attempts,
    }, { onConflict: "user_id,idempotency_key" });
    if (error) throw new Error(`persist intent failed: ${error.message}`);
    if (i.result && (i.status === "filled" || i.status === "partially_filled") && i.result.avgPrice) {
      const { data: o } = await this.db.from("trade_orders").select("id").eq("user_id", this.userId).eq("idempotency_key", i.key).single();
      if (o) await this.db.from("trade_executions").insert({ user_id: this.userId, order_id: o.id, filled_qty: i.result.filledQty.toString(), avg_price: i.result.avgPrice.toString(), fee: i.result.fee.toString() });
    }
  }
  async audit(action: string, detail: Record<string, unknown>) {
    await this.db.from("execution_logs").insert({ user_id: this.userId, action, detail });
    await this.db.from("audit_logs").insert({ user_id: this.userId, actor: "system", action, detail });
  }
  async getTrackedPositions() { return this.tracked; }
  async setTrackedPositions(p: Position[]) {
    this.tracked = p;
    await this.db.from("open_positions").delete().eq("user_id", this.userId).eq("mode", this.mode);
    if (p.length) await this.db.from("open_positions").insert(p.map((x) => ({
      user_id: this.userId, broker_position_id: x.id, mode: this.mode, symbol: x.symbol, side: x.side, qty: x.qty.toString(), entry_price: x.entryPrice.toString(),
      stop_loss: x.stopLoss?.toString() ?? null, take_profit: x.takeProfit?.toString() ?? null, opened_at: x.openedAt.toISOString(),
    })));
  }
}
