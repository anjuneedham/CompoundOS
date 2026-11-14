import { z } from "zod";

// All Claude responses are validated against these schemas. Invalid => rejected & logged.

export const MarketAssessment = z.object({
  symbol: z.string(),
  regime: z.enum(["trending_up", "trending_down", "ranging", "volatile", "unclear"]),
  volatility: z.enum(["low", "normal", "high"]),
  keyLevels: z.object({ support: z.array(z.number()), resistance: z.array(z.number()) }).strict(),
  summary: z.string().max(2000),
  confidence: z.number().min(0).max(1),
}).strict();
export type MarketAssessment = z.infer<typeof MarketAssessment>;

export const TradeProposal = z.object({
  action: z.enum(["propose_trade", "no_trade"]),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]).nullable(),
  entryPrice: z.number().positive().nullable(),
  stopLoss: z.number().positive().nullable(),
  takeProfit: z.number().positive().nullable(),
  rationale: z.string().max(2000),
  confidence: z.number().min(0).max(1),
}).strict();
export type TradeProposal = z.infer<typeof TradeProposal>;

export const StrategyReview = z.object({
  verdict: z.enum(["healthy", "watch", "deteriorating", "insufficient_data"]),
  observations: z.array(z.string()).max(10),
  suggestedParameterChanges: z.array(z.object({ name: z.string(), from: z.number(), to: z.number(), reason: z.string() }).strict()).max(5),
}).strict();

export const RiskObservation = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  observations: z.array(z.string()).max(10),
}).strict();

export const PortfolioReport = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
  headline: z.string().max(300),
  sections: z.array(z.object({ title: z.string(), body: z.string() }).strict()).max(8),
}).strict();

export const CAPABILITIES = {
  market_analyst: { schema: MarketAssessment, system: "You are the CompoundOS market analyst. Assess market regime, volatility and key levels ONLY from the data provided. Do not invent data. If data is insufficient, say regime 'unclear' with low confidence." },
  trade_proposer: { schema: TradeProposal, system: "You are the CompoundOS trade proposer. You may propose at most one trade, or no_trade. Any proposal MUST include a stop loss. Your proposal is advisory: a deterministic risk engine will validate and size it, and may reject it. Prefer no_trade when evidence is weak." },
  strategy_analyst: { schema: StrategyReview, system: "You are the CompoundOS strategy analyst. Review the backtest/paper metrics provided. Be skeptical of small samples and in-sample results." },
  risk_observer: { schema: RiskObservation, system: "You are the CompoundOS risk observer. Point out exposure concentration, loss patterns and anomalies in the provided data. You cannot change risk limits." },
  portfolio_reporter: { schema: PortfolioReport, system: "You are the CompoundOS portfolio reporter. Summarize ONLY the figures provided. Never describe deposits as returns. Distinguish realized and unrealized P/L, gross and net, and fees." },
} as const;
export type Capability = keyof typeof CAPABILITIES;
