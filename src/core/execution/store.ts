import type { Decimal } from "../money/decimal";
import type { Position, Signal } from "../types";
import type { OrderResult } from "../broker/adapter";
import type { RiskDecision } from "../risk/engine";

export type IntentStatus = "pending" | "submitted" | "filled" | "partially_filled" | "rejected" | "risk_rejected" | "unknown";

export interface OrderIntent {
  key: string;
  signal: Signal;
  qty: Decimal;
  status: IntentStatus;
  decision: RiskDecision;
  result?: OrderResult;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEntry { at: Date; action: string; detail: Record<string, unknown> }

/**
 * Persistence port. In production this is backed by Supabase (see src/lib/supabase/store.ts
 * and the trade_orders / execution_logs / audit_logs tables). In tests it's in-memory.
 */
export interface ExecutionStore {
  getIntent(key: string): Promise<OrderIntent | undefined>;
  saveIntent(i: OrderIntent): Promise<void>;
  listIntents(): Promise<OrderIntent[]>;
  audit(action: string, detail: Record<string, unknown>): Promise<void>;
  /** Positions we believe are open (system of record). */
  getTrackedPositions(): Promise<Position[]>;
  setTrackedPositions(p: Position[]): Promise<void>;
}

export class MemoryStore implements ExecutionStore {
  intents = new Map<string, OrderIntent>();
  auditLog: AuditEntry[] = [];
  tracked: Position[] = [];
  async getIntent(k: string) { return this.intents.get(k); }
  async saveIntent(i: OrderIntent) { this.intents.set(i.key, { ...i, updatedAt: new Date() }); }
  async listIntents() { return [...this.intents.values()]; }
  async audit(action: string, detail: Record<string, unknown>) { this.auditLog.push({ at: new Date(), action, detail }); }
  async getTrackedPositions() { return this.tracked; }
  async setTrackedPositions(p: Position[]) { this.tracked = p; }
}
