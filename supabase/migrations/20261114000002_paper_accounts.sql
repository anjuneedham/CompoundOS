-- Persistent state for the simulated (paper) broker, so stateless functions can resume.
create table paper_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_balance numeric(28,10) not null default 10000,
  broker_state jsonb not null,
  day date not null default current_date,
  day_start_equity numeric(28,10) not null,
  peak_equity numeric(28,10) not null,
  trades_today int not null default 0,
  updated_at timestamptz not null default now()
);
alter table paper_accounts enable row level security;
create policy paper_accounts_owner_select on paper_accounts for select to authenticated using ((select auth.uid()) = user_id);

-- Cron lock helper: claim a job if not locked (prevents overlapping runs).
create or replace function claim_job(p_user uuid, p_job text, p_lock_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update scheduled_jobs set locked_until = now() + make_interval(secs => p_lock_seconds)
   where user_id = p_user and job = p_job and enabled and (locked_until is null or locked_until < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke execute on function claim_job(uuid, text, int) from public, authenticated, anon;
