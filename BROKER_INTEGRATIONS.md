# Broker integrations

All brokers implement `BrokerAdapter` (`src/core/broker/adapter.ts`). Only `MockBroker` exists today.

> ⚠️ The notes below are from prior knowledge and were **not re-verified against live documentation in this session**. Re-check each point against the official docs before building an adapter. No endpoints are hard-coded anywhere in the codebase.

## Owner input required
Which exact account(s) will be used? e.g. *Deriv options/multipliers (Deriv trading account)*, *Deriv MT5 (Financial / Synthetic / Swap-free)*, *Pepperstone cTrader*, *Pepperstone MT4/MT5*. Demo or live? Do not share credentials in chat.

## Deriv (to verify: developers.deriv.com / api.deriv.com)
- Deriv's public API is WebSocket-based, authenticated with an API token (scoped permissions) or OAuth, plus a registered `app_id`.
- It covers Deriv's own products (options, multipliers, accumulators) on Deriv accounts, including synthetic indices.
- **Deriv MT5 accounts are a different product.** Trading MT5 positions is not the same as the options API; MT5 has no first-party REST trading API for retail use. Plan: confirm whether the WebSocket API exposes what is needed for the chosen account type.
- Adapter plan: per-cycle connect → authorize → `proposal`/`buy` (or multiplier contract) → poll `portfolio`/`profit_table` → disconnect. Contract semantics (fixed stake, payout) differ from FX lots, so `positionSize` needs a contract-type-specific mapping.

## Pepperstone (to verify: help.ctrader.com / Open API docs)
- Pepperstone offers MT4, MT5, cTrader and TradingView. Programmatic access suited to a cloud app is the **cTrader Open API** (OAuth2 app registration with Spotware, Protobuf/JSON over TCP/WebSocket), only for **cTrader** accounts.
- MT4/MT5 have no official web REST API; options are EAs running inside a terminal (needs a VPS) or third-party bridges — out of scope unless explicitly approved.
- Adapter plan: OAuth tokens stored in Supabase Vault; per-cycle connect → `ApplicationAuth` → `AccountAuth` → reconcile → orders with client order id = idempotency key → disconnect.

## Requirements before any live adapter
1. Verified official docs + account eligibility. 2. Demo-account adapter passing the same simulation suite as `MockBroker`. 3. Credentials in Vault, never in tables/logs. 4. Paper validation period. 5. Separate live-trading release with explicit owner authorization.
