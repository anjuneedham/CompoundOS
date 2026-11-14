import { D, Decimal } from "../money/decimal";

export interface RiskLimits {
  maxRiskPerTradePct: Decimal;    // 0.5 => 0.5% of equity
  maxDailyLossPct: Decimal;       // 2
  maxDrawdownPct: Decimal;        // 5
  maxConcurrentPositions: number;
  maxExposurePerInstrumentPct: Decimal; // notional / equity
  maxCorrelatedExposurePct: Decimal;
  maxDailyTrades: number;
  allowedSymbols: string[] | "all";
  allowedStrategies: string[] | "all";
}

/** Conservative defaults. These are starting values, not recommendations. */
export const DEFAULT_LIMITS: RiskLimits = {
  maxRiskPerTradePct: D("0.5"),
  maxDailyLossPct: D("2"),
  maxDrawdownPct: D("5"),
  maxConcurrentPositions: 3,
  maxExposurePerInstrumentPct: D("300"),
  maxCorrelatedExposurePct: D("500"),
  maxDailyTrades: 10,
  allowedSymbols: "all",
  allowedStrategies: "all",
};
