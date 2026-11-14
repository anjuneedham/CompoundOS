-- CompoundOS initial schema. Money = numeric(28,10). All user tables: RLS on, owner-only.

-- ===== enums =====
create type trading_mode as enum ('research','paper','live');
create type order_side as enum ('buy','sell');
create type intent_status as enum ('pending','submitted','filled','partially_filled','rejected','risk_rejected','unknown','cancelled');
create type risk_severity as enum ('info','warning','critical');
create type emergency_policy as enum ('halt_only','close_all','close_losing');

-- ===== helpers =====
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== USER MANAGEMENT =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trading_mode trading_mode not null default 'research',
  -- live trading requires a separate server-side enablement; never set by client.
  live_trading_authorized boolean not null default false,
  live_authorized_at timestamptz,
  ai_analysis_interval_minutes int not null default 240 check (ai_analysis_interval_minutes >= 15),
  ai_daily_token_budget int not null default 200000 check (ai_daily_token_budget >= 0),
  emergency_policy emergency_policy not null default 'halt_only',
  trading_schedule jsonb not null default '{"days":[1,2,3,4,5],"startUtc":"07:00","endUtc":"20:00"}',
  notifications jsonb not null default '{"email":false}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  granted_at timestamptz not null default now(),
  unique (user_id, permission)
);

-- ===== BROKER MANAGEMENT =====
create table broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null check (broker in ('mock','deriv','pepperstone_ctrader')),
  label text not null,
  is_live boolean not null default false,
  status text not null default 'disconnected' check (status in ('connected','disconnected','error','pending_verification')),
  -- Reference to a server-side secret (Supabase Vault id). NEVER the credential itself.
  credential_secret_id uuid,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references broker_connections(id) on delete cascade,
  external_account_id text not null,
  currency char(3) not null default 'USD',
  account_type text not null default 'demo' check (account_type in ('demo','live')),
  trading_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (connection_id, external_account_id)
);
create table broker_account_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references broker_accounts(id) on delete cascade,
  balance numeric(28,10) not null,
  equity numeric(28,10) not null,
  margin_used numeric(28,10),
  taken_at timestamptz not null default now()
);
create index on broker_account_snapshots (account_id, taken_at desc);
create table broker_instruments (
  id uuid primary key default gen_random_uuid(),
  broker text not null,
  symbol text not null,
  asset_class text not null,
  contract_size numeric(28,10) not null,
  min_qty numeric(28,10) not null,
  qty_step numeric(28,10) not null,
  correlation_group text,
  unique (broker, symbol)
);

-- ===== TRADING =====
create table trading_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  symbols text[] not null default '{}',
  timeframe text not null default '1h',
  is_active boolean not null default false,
  is_halted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create table strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references trading_strategies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  params jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (strategy_id, version)
);
create table strategy_parameters (
  id uuid primary key default gen_random_uuid(),
  strategy_version_id uuid not null references strategy_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric(28,10) not null,
  unique (strategy_version_id, name)
);
create table trading_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references trading_strategies(id) on delete set null,
  source text not null check (source in ('strategy','ai')),
  symbol text not null,
  side order_side not null,
  entry_price numeric(28,10) not null,
  stop_loss numeric(28,10) not null,
  take_profit numeric(28,10),
  reason text,
  created_at timestamptz not null default now()
);
create index on trading_signals (user_id, created_at desc);
create table trade_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references broker_accounts(id) on delete set null,
  signal_id uuid references trading_signals(id) on delete set null,
  idempotency_key text not null,
  mode trading_mode not null,
  symbol text not null,
  side order_side not null,
  qty numeric(28,10) not null,
  status intent_status not null default 'pending',
  risk_checks jsonb not null default '[]',
  rejection_reasons text[] not null default '{}',
  broker_order_id text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index on trade_orders (user_id, created_at desc);
create index on trade_orders (status) where status in ('submitted','unknown');
create table trade_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references trade_orders(id) on delete cascade,
  filled_qty numeric(28,10) not null,
  avg_price numeric(28,10) not null,
  fee numeric(28,10) not null default 0,
  executed_at timestamptz not null default now()
);
create table open_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references broker_accounts(id) on delete cascade,
  broker_position_id text not null,
  mode trading_mode not null,
  symbol text not null,
  side order_side not null,
  qty numeric(28,10) not null,
  entry_price numeric(28,10) not null,
  stop_loss numeric(28,10),
  take_profit numeric(28,10),
  strategy_id uuid references trading_strategies(id) on delete set null,
  opened_at timestamptz not null default now(),
  unique (user_id, broker_position_id)
);
create table position_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_position_id text not null,
  mode trading_mode not null,
  symbol text not null,
  side order_side not null,
  qty numeric(28,10) not null,
  entry_price numeric(28,10) not null,
  exit_price numeric(28,10) not null,
  gross_pnl numeric(28,10) not null,
  fees numeric(28,10) not null default 0,
  net_pnl numeric(28,10) not null,
  strategy_id uuid references trading_strategies(id) on delete set null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);
create index on position_history (user_id, closed_at desc);

-- ===== AI =====
create table ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('manual','scheduled')),
  created_at timestamptz not null default now()
);
create table ai_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references ai_sessions(id) on delete set null,
  capability text not null,
  input_hash text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
create index on ai_research (user_id, capability, created_at desc);
create table ai_market_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  regime text not null,
  volatility text not null,
  confidence numeric(5,4) not null,
  summary text not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);
create table ai_trade_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  action text not null,
  side order_side,
  entry_price numeric(28,10),
  stop_loss numeric(28,10),
  take_profit numeric(28,10),
  rationale text,
  confidence numeric(5,4),
  risk_approved boolean,
  rejection_reasons text[] not null default '{}',
  order_id uuid references trade_orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create table ai_decision_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  input_hash text not null,
  ok boolean not null,
  error text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);
create index on ai_decision_logs (user_id, created_at desc);

-- ===== RISK =====
create table risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'default',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table risk_limits (
  profile_id uuid primary key references risk_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  max_risk_per_trade_pct numeric(8,4) not null default 0.5 check (max_risk_per_trade_pct > 0 and max_risk_per_trade_pct <= 5),
  max_daily_loss_pct numeric(8,4) not null default 2 check (max_daily_loss_pct > 0 and max_daily_loss_pct <= 20),
  max_drawdown_pct numeric(8,4) not null default 5 check (max_drawdown_pct > 0 and max_drawdown_pct <= 50),
  max_concurrent_positions int not null default 3 check (max_concurrent_positions between 1 and 50),
  max_exposure_per_instrument_pct numeric(8,4) not null default 300,
  max_correlated_exposure_pct numeric(8,4) not null default 500,
  max_daily_trades int not null default 10 check (max_daily_trades between 1 and 500),
  allowed_symbols text[],          -- null = all
  updated_at timestamptz not null default now(),
  updated_by text not null default 'user' check (updated_by in ('user','system')) -- never 'ai'
);
create table risk_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  severity risk_severity not null,
  rule text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on risk_events (user_id, created_at desc);
create table trading_halts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('global','kill_switch','strategy')),
  strategy_id uuid references trading_strategies(id) on delete cascade,
  reason text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);
create index on trading_halts (user_id) where active;
create table daily_risk_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  day_start_equity numeric(28,10) not null,
  peak_equity numeric(28,10) not null,
  min_equity numeric(28,10) not null,
  trades int not null default 0,
  unique (user_id, day)
);

-- ===== PORTFOLIO =====
create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'long_term' check (kind in ('long_term','trading')),
  base_currency char(3) not null default 'USD',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table portfolio_allocations (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  target_weight_pct numeric(8,4) not null check (target_weight_pct between 0 and 100),
  unique (portfolio_id, symbol)
);
create table investment_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit','withdrawal','buy','sell','dividend','fee','realized_pnl')),
  symbol text,
  qty numeric(28,10),
  price numeric(28,10),
  amount numeric(28,10) not null,
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index on investment_transactions (portfolio_id, occurred_at);
create table portfolio_snapshots (
  id bigint generated always as identity primary key,
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cash numeric(28,10) not null,
  invested numeric(28,10) not null,
  market_value numeric(28,10) not null,
  taken_at timestamptz not null default now()
);

-- ===== PERFORMANCE =====
create table daily_performance (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode trading_mode not null,
  day date not null,
  start_equity numeric(28,10) not null,
  end_equity numeric(28,10) not null,
  realized_pnl numeric(28,10) not null default 0,
  unrealized_pnl numeric(28,10) not null default 0,
  fees numeric(28,10) not null default 0,
  deposits numeric(28,10) not null default 0,
  withdrawals numeric(28,10) not null default 0,
  unique (user_id, mode, day)
);
create table strategy_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_version_id uuid not null references strategy_versions(id) on delete cascade,
  kind text not null check (kind in ('backtest_in_sample','backtest_out_of_sample','walk_forward','paper','live')),
  config jsonb not null,
  metrics jsonb not null,
  equity_curve jsonb,
  created_at timestamptz not null default now()
);
create table trade_statistics (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode trading_mode not null,
  period_start date not null,
  period_end date not null,
  trades int not null,
  wins int not null,
  gross_profit numeric(28,10) not null,
  gross_loss numeric(28,10) not null,
  fees numeric(28,10) not null
);
create table equity_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode trading_mode not null,
  equity numeric(28,10) not null,
  balance numeric(28,10) not null,
  taken_at timestamptz not null default now()
);
create index on equity_history (user_id, mode, taken_at);

-- ===== SYSTEM =====
create table system_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job text not null check (job in ('paper_cycle','risk_monitor','ai_research','daily_report')),
  enabled boolean not null default false,
  interval_minutes int not null default 60 check (interval_minutes >= 5),
  last_run_at timestamptz,
  last_status text,
  locked_until timestamptz,
  unique (user_id, job)
);
create table execution_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references trade_orders(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on execution_logs (user_id, created_at desc);
create table system_health (
  id bigint generated always as identity primary key,
  component text not null,
  status text not null check (status in ('ok','degraded','down')),
  detail jsonb not null default '{}',
  checked_at timestamptz not null default now()
);
create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  actor text not null check (actor in ('user','system','ai')),
  action text not null,
  entity text,
  entity_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_logs (user_id, created_at desc);
-- Audit logs are append-only.
create or replace function audit_logs_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_no_update before update or delete on audit_logs for each row execute function audit_logs_immutable();

-- ===== triggers =====
create trigger t_profiles_u before update on profiles for each row execute function set_updated_at();
create trigger t_settings_u before update on user_settings for each row execute function set_updated_at();
create trigger t_conn_u before update on broker_connections for each row execute function set_updated_at();
create trigger t_strat_u before update on trading_strategies for each row execute function set_updated_at();
create trigger t_orders_u before update on trade_orders for each row execute function set_updated_at();
create trigger t_limits_u before update on risk_limits for each row execute function set_updated_at();

-- Prevent clients from self-authorizing live trading: only service_role may change it.
create or replace function guard_live_authorization() returns trigger language plpgsql as $$
begin
  if (new.live_trading_authorized is distinct from old.live_trading_authorized or (new.trading_mode = 'live' and old.trading_mode <> 'live'))
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live trading authorization can only be changed by the server';
  end if;
  return new;
end $$;
create trigger t_settings_live_guard before update on user_settings for each row execute function guard_live_authorization();

-- Bootstrap rows on signup.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  insert into profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  insert into user_settings (user_id) values (new.id);
  insert into risk_profiles (user_id) values (new.id) returning id into pid;
  insert into risk_limits (profile_id, user_id) values (pid, new.id);
  insert into portfolios (user_id, name, kind) values (new.id, 'Paper Trading', 'trading'), (new.id, 'Long-Term', 'long_term');
  insert into audit_logs (user_id, actor, action) values (new.id, 'system', 'account_created');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ===== RLS =====
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','permissions','broker_connections','broker_accounts','broker_account_snapshots',
    'trading_strategies','strategy_versions','strategy_parameters','trading_signals','trade_orders','trade_executions',
    'open_positions','position_history','ai_sessions','ai_research','ai_market_assessments','ai_trade_proposals','ai_decision_logs',
    'risk_profiles','risk_limits','risk_events','trading_halts','daily_risk_snapshots','portfolios','portfolio_allocations',
    'investment_transactions','portfolio_snapshots','daily_performance','strategy_performance','trade_statistics','equity_history',
    'scheduled_jobs','execution_logs','audit_logs','system_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s_owner_select" on %I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
  end loop;
end $$;
alter table profiles enable row level security;
create policy profiles_owner on profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter table broker_instruments enable row level security;
create policy instruments_read on broker_instruments for select to authenticated using (true);
alter table system_health enable row level security;
create policy health_read on system_health for select to authenticated using (true);

-- Writable-by-owner tables (the rest are written only by server code using service_role).
create policy user_settings_owner_update on user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy strategies_owner_write on trading_strategies for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy strategy_versions_owner_insert on strategy_versions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy portfolios_owner_write on portfolios for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy allocations_owner_write on portfolio_allocations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy inv_tx_owner_insert on investment_transactions for insert to authenticated with check ((select auth.uid()) = user_id);
-- NOTE: no client insert/update on trade_orders, open_positions, risk_limits, trading_halts, audit_logs.
-- Orders and risk changes go through authenticated server routes that re-check permissions.

-- seed instrument metadata for the mock broker
insert into broker_instruments (broker, symbol, asset_class, contract_size, min_qty, qty_step, correlation_group) values
  ('mock','EURUSD','forex',1,1000,1000,'USD'),('mock','GBPUSD','forex',1,1000,1000,'USD'),('mock','SYN100','synthetic',1,0.01,0.01,null);
