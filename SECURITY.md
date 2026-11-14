# Security

## Controls
- **Secrets server-side only**: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` are read only in `server-only` modules. A test scans client components and the built bundle for secret names.
- **AuthN**: Supabase Auth; middleware and every server action call `auth.getUser()` (server-validated JWT).
- **AuthZ**: RLS on every user table (owner-only SELECT). Financial tables (`trade_orders`, `open_positions`, `risk_limits`, `trading_halts`, `audit_logs`, `paper_accounts`) have **no client write policies**; writes happen in server code scoped to the verified user id. Verified by `tests/migration.test.ts`.
- **Live trading guard**: DB trigger rejects any non-service-role change to `live_trading_authorized` or switching to `live`. Engine refuses mismatched mode/adapter.
- **Input validation**: zod on every server action; DB check constraints cap risk limits.
- **Output validation**: Claude responses parsed and zod-validated; refusals/max_tokens rejected; proposals still pass the risk engine.
- **Idempotency / replay**: unique `(user_id, idempotency_key)`; cron protected by bearer secret (constant-time compare) and a DB lock (`claim_job`).
- **Rate limiting**: AI 1 run/30 s/user + daily token budget. (Add Vercel Firewall / edge rate-limit for auth endpoints in production.)
- **Audit**: append-only `audit_logs` (trigger blocks UPDATE/DELETE).
- **Logs**: no credentials logged; health endpoint reports only presence of config.
- **Claude never receives** broker credentials, account ids or emails — only a market brief.

## Threat model (STRIDE summary)
| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Forged cron call | Bearer secret, timing-safe compare |
| Tampering | Browser raises own risk limits / enables live | No RLS write policy; trigger; zod; confirmation phrase |
| Repudiation | "I didn't change that" | Append-only audit with actor + before/after |
| Info disclosure | Service key in bundle | server-only imports, bundle scan test |
| DoS / cost | Spamming AI | Rate limit, token budget, cache |
| Elevation | Prompt injection makes Claude "approve" a trade | AI has no tools/authority; deterministic risk engine; schema validation |
| Duplicate execution | Retry after timeout | Idempotency key + broker lookup before retry |

## Known gaps
No MFA enforcement yet · no email alerts · no external error monitoring (Sentry optional) · Vault credential flow not yet built (no real brokers).

Report vulnerabilities privately to the repository owner.
