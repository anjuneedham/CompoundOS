# Roadmap & progress tracker

Status legend: ✅ done · 🟡 partial · ⬜ not started · ⛔ blocked

## Implementation checklist
| Task | Status | Depends on | Completion criteria | Test evidence | Known limitations |
|---|---|---|---|---|---|
| P0 Repo inspection, architecture, docs | ✅ | — | Docs present | — | Repo was empty |
| P1 Supabase secret/publishable key support | ✅ | — | New keys preferred, legacy fallback | `tests/security.test.ts`, migration tests | — |
| P1 Next.js app, theme, nav, auth, setup screen | ✅ | Supabase project | Build passes; unauth → login/setup | `next build`; smoke curl | Not deployed |
| P1 DB migrations + RLS | ✅ | — | Applies cleanly; RLS isolation | `tests/migration.test.ts` (PGlite) | Not yet applied to a real Supabase project |
| P2 Financial data foundation (accounts, portfolio, tx, audit) | ✅ | P1 | Deposits ≠ returns; decimal precision | `tests/portfolio.test.ts` | Long-term holdings valued at cost (no price source) |
| P3 Claude integration + structured outputs | 🟡 | API key | Validated JSON, logged, budgeted; all 5 capabilities triggerable | `tests/ai.test.ts` (mocked) | Not exercised against the real API yet |
| P4 Strategy lab, indicators, backtesting, walk-forward | ✅ | — | No look-ahead; costs applied | `tests/indicators.test.ts`, `tests/backtest.test.ts` | Simulated data only; 2 strategy types; no custom rule builder |
| P5 Broker abstraction + mock broker | ✅ | — | Fault scenarios pass | `tests/execution.test.ts` | — |
| P5 Real broker adapter | ⛔ | Owner confirms account type | Demo adapter passes simulation suite | — | See BROKER_INTEGRATIONS.md |
| P6 Risk engine, halts, kill switch | ✅ | — | Breach blocks orders | `tests/risk.test.ts`, `tests/execution.test.ts` | Correlation groups are static |
| P7 Paper trading end-to-end | 🟡 | Supabase project | Cycle persists orders/positions/equity | Engine-level tests | Supabase-backed path untested against a live DB |
| P8 Scheduled autonomous ops (risk monitor, paper cycle, AI research, reports) | 🟡 | P7, pg_cron | Due jobs run in order, locked, status recorded | — | Needs pg_cron setup; not run against live DB |
| P9 Live readiness | ⬜ | Real adapter, paper record | Separate authorization flow | — | Intentionally disabled |
| P10 Hardening (Sentry, e2e, MFA, email alerts) | ⬜ | Deployment | — | — | — |
| Notifications framework | 🟡 | — | Events recorded in audit/risk_events | — | No email/push delivery yet |
| Daily/weekly/monthly reports | ✅ | P3 | Deterministic figures + optional AI narrative; scheduled | — | Stored in `ai_research` (capability `report`); no email delivery |
| Cost monitoring | ✅ | — | Token usage + $ estimate | Settings → Cost monitor | List-price estimate, excludes cache discounts |

## Next tasks (in order)
1. Owner: create Supabase project (any account), run migrations, set keys in Vercel, deploy; verify signup → paper cycle → schedules.
2. Integration test of `src/server/*` against a Supabase branch/local stack.
3. Playwright e2e: signup, strategy create, backtest, paper cycle, risk rejection, kill switch, report.
4. Notifications delivery (email via Resend or Supabase SMTP) for halts, rejections, reports.
5. After owner confirms broker/account type: verify docs, build demo adapter (Phase 5 real broker).
6. Phase 9 live-readiness design (authorization flow, paper-validation criteria); Phase 10 hardening (Sentry, MFA).
