# Trading engine

`src/core/execution/engine.ts` implements the mandatory sequence:

| # | Step | Implementation |
|---|---|---|
| 1 | Receive signal | `execute(signal)` — from strategy or validated AI proposal |
| 2 | Validate instrument | `instrument_known`, `instrument_permitted` checks |
| 3 | Account status | broker connected, account trading enabled |
| 4 | Permissions | mode, live authorization, halts, strategy permitted, market schedule |
| 5 | Position size | `positionSize()` — risk% of equity / (stop distance × contract size), rounded **down** to step; capped by remaining daily-loss allowance |
| 6 | Risk limits | daily loss, drawdown, concurrent positions, daily trades, instrument & correlated exposure, balance |
| 7 | Duplicates | deterministic idempotency key (strategy, symbol, side, price, 1‑min bucket of the bar); unique in DB |
| 8 | Order intent | persisted **before** submission |
| 9 | Submit | `placeOrder({clientOrderId: key})` |
| 10 | Verify | status from broker; on error query `getOrderByClientId` before any retry |
| 11 | Record | `trade_orders`, `trade_executions`, `execution_logs`, `audit_logs` |
| 12 | Reconcile | broker positions vs tracked; mismatches audited |

## Failure handling (tested in `tests/execution.test.ts`)
Network error before fill → safe retry with same key · timeout after fill → resolved by lookup, no resubmit · rejection → recorded · partial fill → `partially_filled` · disconnect → rejected + monitor halts · duplicate signal → ignored · unknown outcome after retries → `unknown`, flagged for reconciliation.

## Backtesting
`src/core/backtest/engine.ts`: signal at bar *i* close, entry at bar *i+1* open (no look-ahead, test-verified), spread + slippage + per-unit fees, stop assumed before target when both touched in one bar, in-sample/out-of-sample split, walk-forward. Survivorship bias: N/A for single-instrument FX/synthetic series; must be addressed when equities are added.

## Strategies
`sma_crossover`, `rsi_reversion` (`src/core/strategy/types.ts`). Add new ones by implementing `StrategyDefinition`.
