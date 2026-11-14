import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { D } from "@/core/money/decimal";
import type { RiskLimits } from "@/core/risk/limits";
import type { HaltState, EmergencyPolicy } from "@/core/risk/engine";
import type { TradingMode } from "@/core/types";

export interface UserContext {
  mode: TradingMode; liveAuthorized: boolean; emergencyPolicy: EmergencyPolicy;
  limits: RiskLimits; halts: HaltState;
  strategies: { id: string; name: string; kind: string; symbols: string[]; params: Record<string, number>; is_active: boolean; is_halted: boolean }[];
  schedule: { days: number[]; startUtc: string; endUtc: string };
}

export async function loadContext(db: SupabaseClient, userId: string): Promise<UserContext> {
  const [{ data: s }, { data: rl }, { data: halts }, { data: strats }] = await Promise.all([
    db.from("user_settings").select("*").eq("user_id", userId).single(),
    db.from("risk_limits").select("*").eq("user_id", userId).limit(1).single(),
    db.from("trading_halts").select("scope,strategy_id").eq("user_id", userId).eq("active", true),
    db.from("trading_strategies").select("id,name,kind,symbols,is_active,is_halted,strategy_versions(version,params)").eq("user_id", userId),
  ]);
  if (!s || !rl) throw new Error("user settings missing");
  return {
    mode: s.trading_mode, liveAuthorized: s.live_trading_authorized, emergencyPolicy: s.emergency_policy, schedule: s.trading_schedule,
    limits: {
      maxRiskPerTradePct: D(rl.max_risk_per_trade_pct), maxDailyLossPct: D(rl.max_daily_loss_pct), maxDrawdownPct: D(rl.max_drawdown_pct),
      maxConcurrentPositions: rl.max_concurrent_positions, maxExposurePerInstrumentPct: D(rl.max_exposure_per_instrument_pct),
      maxCorrelatedExposurePct: D(rl.max_correlated_exposure_pct), maxDailyTrades: rl.max_daily_trades,
      allowedSymbols: rl.allowed_symbols ?? "all", allowedStrategies: "all",
    },
    halts: {
      global: (halts ?? []).some((h) => h.scope === "global"),
      killSwitch: (halts ?? []).some((h) => h.scope === "kill_switch"),
      haltedStrategies: [...(halts ?? []).filter((h) => h.scope === "strategy").map((h) => h.strategy_id as string), ...(strats ?? []).filter((x) => x.is_halted).map((x) => x.id)],
    },
    strategies: (strats ?? []).map((x) => {
      const versions = (x.strategy_versions as { version: number; params: Record<string, number> }[]) ?? [];
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      return { id: x.id, name: x.name, kind: x.kind, symbols: x.symbols, is_active: x.is_active, is_halted: x.is_halted, params: latest?.params ?? {} };
    }),
  };
}

export function inSchedule(sch: UserContext["schedule"], now = new Date()) {
  const hm = now.toISOString().slice(11, 16);
  return sch.days.includes(now.getUTCDay()) && hm >= sch.startUtc && hm < sch.endUtc;
}
