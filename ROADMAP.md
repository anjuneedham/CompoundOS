# Roadmap & progress tracker

Status legend: ✅ done · 🟡 partial · ⬜ not started · ⛔ blocked

## Implementation checklist
| Task | Status | Depends on | Completion criteria | Test evidence | Known limitations |
|---|---|---|---|---|---|
| P0 Repo inspection, architecture, docs | ✅ | — | Docs present | — | Repo was empty |
| P1 Next.js app, theme, nav, auth, setup screen | ✅ | Supabase project | Build passes; unauth → login/setup | `next build`; smoke curl | Not deployed |
| P1 DB migrations + RLS | ✅ | — | Applies cleanly; RLS isolation | `tests/migration.test.ts` (PGlite) | Not yet applied to a real Supabase project |
| P2 Financial data foundation (accounts, portfolio, tx, audit) | ✅ | P1 | Deposits ≠ returns; decimal precision | `tests/portfolio.test.ts` | Long-term holdings valued at cost (no price source) |
| P3 Claude integration + structured outputs | 🟡 | API key | Validated JSON, logged, budgeted | `tests/ai.test.ts` (mocked) | Not exercised against the real API in this session; strategy_analyst / risk_observer / portfolio_reporter schemas exist but have no UI trigger yet |
| P4 Strategy lab, indicators, backtesting, walk-forward | ✅ | — | No look-ahead; costs applied | `tests/indicators.test.ts`, `tests/backtest.test.ts` | Simulated data only; 2 strategy types; no custom rule builder |
| P5 Broker abstraction + mock broker | ✅ | — | Fault scenarios pass | `tests/execution.test.ts` | — |
| P5 Real broker adapter | ⛔ | Owner confirms account type | Demo adapter passes simulation suite | — | See BROKER_INTEGRATIONS.md |
| P6 Risk engine, halts, kill switch | ✅ | — | Breach blocks orders | `tests/risk.test.ts`, `tests/execution.test.ts` | Correlation groups are static |
| P7 Paper trading end-to-end | 🟡 | Supabase project | Cycle persists orders/positions/equity | Engine-level tests | Supabase-backed path untested against a live DB |
| P8 Scheduled autonomous paper ops | 🟡 | P7, pg_cron | Due jobs run, locked | — | Needs pg_cron setup (DEPLOYMENT.md) |
| P9 Live readiness | ⬜ | Real adapter, paper record | Separate authorization flow | — | Intentionally disabled |
| P10 Hardening (Sentry, e2e, MFA, email alerts) | ⬜ | Deployment | — | — | — |
| Notifications framework | 🟡 | — | Events recorded in audit/risk_events | — | No email/push delivery yet |
| Daily/weekly/monthly AI reports | ⬜ | P3 | Scheduled report rows | — | Schema `PortfolioReport` ready |
| Cost monitoring page | 🟡 | — | Token usage visible | AI call log shows tokens | No $ estimate panel yet |

## Next tasks (in order)
1. Apply migrations to the Supabase project, deploy to Vercel, verify signup → paper cycle end-to-end.
2. Integration test of `src/server/*` against a Supabase branch/local stack.
3. Add UI triggers for strategy_analyst, risk_observer and daily portfolio_reporter (scheduled job `daily_report`).
4. Cost panel (tokens × price) in Settings.
5. Playwright e2e: signup, strategy create, backtest, paper cycle, risk rejection, kill switch.
6. After owner confirms broker/account type: verify docs, build demo adapter.
