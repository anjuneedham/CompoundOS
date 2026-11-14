-- Supabase secret keys (sb_secret_…) run as the service_role Postgres role.
-- Recognise server access by DB role as well as JWT claim, so both key types work.
create or replace function is_server_request() returns boolean language sql stable as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin') or coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function guard_live_authorization() returns trigger language plpgsql as $$
begin
  if (new.live_trading_authorized is distinct from old.live_trading_authorized or (new.trading_mode = 'live' and old.trading_mode <> 'live'))
     and not is_server_request() then
    raise exception 'live trading authorization can only be changed by the server';
  end if;
  return new;
end $$;
