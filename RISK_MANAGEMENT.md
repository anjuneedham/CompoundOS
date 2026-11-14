# Risk management

Deterministic, independent of Claude, active when AI is unavailable. Defaults (conservative starting values, not recommendations):

| Limit | Default | DB hard cap |
|---|---|---|
| Max risk per trade | 0.5% equity | ≤ 5% |
| Max daily loss | 2% (vs day-start equity) | ≤ 20% |
| Max drawdown | 5% (vs peak equity) | ≤ 50% |
| Max concurrent positions | 3 | 1–50 |
| Max daily trades | 10 | 1–500 |
| Max exposure per instrument | 300% notional/equity | — |
| Max correlated exposure | 500% notional/equity | — |

- A breach of daily loss or drawdown (or broker disconnection) inserts a **global halt**; no new orders until a user clears it.
- **Kill switch** (Risk Centre) halts immediately and applies the **emergency policy**: `halt_only` (default — positions kept, because closing is not always safer), `close_all`, or `close_losing`.
- Strategy-level halts via `trading_halts(scope='strategy')` or `trading_strategies.is_halted`.
- Limit changes: user-only server action, requires typing a confirmation phrase, audited with before/after. No client RLS write policy exists; AI code paths cannot call it. `risk_limits.updated_by` cannot be `'ai'`.
- Position sizing always rounds down and also caps risk at the remaining daily-loss allowance.
