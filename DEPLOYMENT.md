# Deployment (browser-only workflow)

> Not yet deployed. Nothing here has been run against a production project by the build session.

## 1. Supabase
1. Create a project (free tier is fine for paper trading).
2. SQL Editor → run each file in `supabase/migrations/` **in filename order**.
3. Auth → URL configuration: set Site URL to your Vercel URL; add `https://<app>/auth/callback` as a redirect URL.
4. Settings → API: copy URL, anon/publishable key, service-role key (keep secret).

## 2. Vercel
1. Import the GitHub repo. Framework: Next.js (auto).
2. Environment variables (Production + Preview): see `.env.example`. Generate `CRON_SECRET` with a password manager (≥ 32 chars).
3. Deploy. Check `https://<app>/api/health` → `status: ok`.

## 3. Scheduler (autonomous paper cycles)
Vercel Hobby crons run at most daily, so use Supabase **pg_cron + pg_net** (enable both under Database → Extensions), then in SQL editor:
```sql
select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
select cron.schedule('compoundos-paper-cycle', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://<your-app>.vercel.app/api/cron/run',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
$$);
```
Users enable automation and choose their interval in Settings; the route runs only due jobs.

## 4. Claude
Set `ANTHROPIC_API_KEY` in Vercel (server). Optional `ANTHROPIC_MODEL` (default `claude-opus-5-5`) and `ANTHROPIC_EFFORT` (default `medium`; `low` reduces cost).

## Cost notes (estimates, verify current pricing)
| Item | Expectation |
|---|---|
| Supabase free | Fine for one user; free projects pause after inactivity; paid ~US$25/mo when you need no-pause, backups, more DB |
| Vercel Hobby | Free for personal non-commercial use; Pro ~US$20/mo/user for commercial use or longer functions |
| Claude | Each research run = 2 calls (assessment + proposal), a few thousand tokens. At Opus 5.5 rates ($4/$20 per MTok) roughly US$0.02–0.10 per run; bounded by daily token budget |
| Market data | Simulated feed is free; real data comes from broker APIs (usually free with account) or vendors (paid) |
| Broker | Spreads/commissions per broker; no API fees expected for Deriv/cTrader Open API (verify) |

Live trading infrastructure is **not** guaranteed free: always-on workers, paid data, or higher function limits may become necessary.
