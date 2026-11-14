# CompoundOS

AI investment & autonomous trading platform — an investment operating system that researches markets, evaluates strategies, simulates trades, manages risk and tracks capital, with Claude used for intelligence (never unrestricted financial authority).

> **Status: Phase 0–8 foundation (paper trading on a simulated feed).** Live trading is disabled and not implemented. No real broker is integrated yet. See [ROADMAP.md](ROADMAP.md).

## Principles
Protect capital first · test before deploying capital · deterministic risk engine independent of AI · every decision audited · broker- and AI-provider independent.

## Stack
Next.js 15 (App Router, TS) · Tailwind v4 · Recharts · Supabase (Postgres, Auth, RLS, pg_cron) · Anthropic Claude API · Vitest · Vercel.

## Layout
```
src/core/          Pure, framework-free domain logic (fully unit-tested)
  money/           decimal.js wrapper — no float accounting
  indicators/      SMA, EMA, RSI, MACD, ATR, Bollinger, VWAP
  risk/            deterministic risk engine + position sizing
  broker/          BrokerAdapter interface + MockBroker (fault injection)
  execution/       12-step order pipeline, idempotency, reconciliation, kill switch
  strategy/        strategy definitions (signal generation only)
  backtest/        bar-by-bar backtester, in/out-of-sample, walk-forward
  ai/              Claude orchestrator, zod schemas, Anthropic transport
  portfolio/       capital accounting (deposits ≠ returns), TWR, drawdown
  market/          SIMULATED price feed (labelled everywhere)
src/server/        server-only services: paper cycle, Supabase store, actions
src/app/           UI (10 sections) + API routes (health, cron)
supabase/migrations  schema, RLS, guards
tests/             unit, simulation, DB/RLS (PGlite), security tests
```

## Quick start (browser-only workflow)
1. Create a Supabase project; run the SQL in `supabase/migrations/` in order (SQL editor) — see [DEPLOYMENT.md](DEPLOYMENT.md).
2. Import this repo into Vercel, set env vars from `.env.example`, deploy.
3. Sign up, switch to **Paper** mode in Settings, create & activate a strategy, run a cycle.

Local: `npm install && npm test && npm run build`.

## Scripts
`npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Docs
[ARCHITECTURE](ARCHITECTURE.md) · [ROADMAP & tracker](ROADMAP.md) · [SECURITY](SECURITY.md) · [TRADING_ENGINE](TRADING_ENGINE.md) · [RISK_MANAGEMENT](RISK_MANAGEMENT.md) · [BROKER_INTEGRATIONS](BROKER_INTEGRATIONS.md) · [DEPLOYMENT](DEPLOYMENT.md) · [CHANGELOG](CHANGELOG.md)

**Not financial advice.** Simulated and backtested results do not predict real performance.
