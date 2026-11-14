# Architecture

## Layers
| Layer | Where | Notes |
|---|---|---|
| A. UI | `src/app/(os)/*` | Server components read via user-scoped Supabase client (RLS). Mutations via server actions only. |
| B. AI intelligence | `src/core/ai` | One `AiOrchestrator`, five capabilities (market analyst, trade proposer, strategy analyst, risk observer, portfolio reporter). Structured JSON outputs (`output_config.format`) validated again with zod. Cached 15 min by input hash; daily token budget; 30 s per-user rate limit. |
| C. Decision & risk | `src/core/risk` | Pure deterministic functions. Claude output is treated as an untrusted signal. |
| D. Broker execution | `src/core/broker`, `src/core/execution` | `BrokerAdapter` interface; `MockBroker` is the only implementation today. |
| E. Data & audit | `supabase/migrations` | Normalised schema, numeric(28,10) money, RLS owner-only reads, server-only writes for financial tables, append-only `audit_logs`. |

## Request paths
- **Browser → server action → `requireUser()` (JWT validated with Supabase Auth) → service-role client scoped to that verified user id.** The browser never writes orders, positions, limits or halts (RLS has no client write policies for them).
- **Scheduler → `POST /api/cron/run` (Bearer `CRON_SECRET`, constant-time compare) → `claim_job()` lock → `runPaperCycle()`.**

## Why no persistent worker
Supabase Edge Functions and Vercel functions are short-lived; no long-lived WebSockets are kept. The engine is **stateless per invocation**: broker state (paper) is loaded from `paper_accounts`, the cycle runs, state is saved. Idempotency keys are unique in DB, so retried/overlapping runs cannot double-order. A real streaming broker (e.g. cTrader Open API, Deriv WebSocket) can be used request/response-style per cycle (connect → act → reconcile → disconnect). If sub-minute reaction becomes a requirement, a small always-on worker (e.g. Fly.io/Railway ~US$5/mo) would be needed — not introduced yet.

## Paper cycle
1. Load settings, limits, halts, strategies. 2. Hydrate MockBroker from DB, mark to latest simulated bar. 3. Process stops/targets → `position_history`. 4. Risk monitor: breach/disconnect ⇒ global halt + risk event + emergency policy. 5. For active strategies: evaluate last closed bar → signal → execution pipeline. 6. Reconcile, persist state, append `equity_history`.

## Market data
`src/core/market/simulated.ts` is a deterministic seeded feed (hourly bars from 2026‑01‑01). It is labelled as simulated in every UI that shows it. Replace with a broker/vendor feed per `BROKER_INTEGRATIONS.md`.

## Key decisions
- decimal.js for all accounting; indicators use numbers (signal math only).
- Strategy ≠ execution: strategies return entry intents; only `ExecutionEngine` talks to brokers.
- Live mode refuses non-live adapters and vice-versa; DB trigger prevents clients from self-authorizing live.
