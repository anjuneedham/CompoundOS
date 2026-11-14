# Changelog

## 0.1.0 — 2026-11-14
### Added
- Next.js 15 app with Supabase auth, dark terminal UI, 10 sections (Overview, Trading, AI, Strategies, Portfolio, Risk, Brokers, Performance, Activity, Settings).
- Core domain: decimal money, indicators, risk engine, position sizing, BrokerAdapter + MockBroker with fault injection, 12-step execution pipeline with idempotency and reconciliation, kill switch & emergency policies.
- Backtester with costs, in/out-of-sample split and walk-forward.
- Claude orchestrator with structured outputs, zod validation, caching, token budget.
- Paper trading service with persistent state, scheduled cycles via `/api/cron/run`.
- Supabase migrations: full schema, RLS, live-trading guard, append-only audit.
- 69 automated tests (unit, simulation, DB/RLS via PGlite, security).
