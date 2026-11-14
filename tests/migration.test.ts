import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

// Stubs the parts of Supabase's auth schema the migration depends on.
const AUTH_STUB = `
create role authenticated; create role service_role; create role anon;
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
`;
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function as(uid: string | null, role: string, fn: () => Promise<unknown>) {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ""}'; set request.jwt.claim.role = '${role}'; set role ${role === "service_role" ? "postgres" : role};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated;`);
  await db.exec(`insert into auth.users values ('${U1}','a@example.com'),('${U2}','b@example.com')`);
}, 60000);

describe("database migration", () => {
  it("bootstraps per-user rows on signup with safe defaults", async () => {
    const s = await db.query<{ trading_mode: string; live_trading_authorized: boolean }>(`select trading_mode, live_trading_authorized from user_settings where user_id='${U1}'`);
    expect(s.rows[0]).toEqual({ trading_mode: "research", live_trading_authorized: false });
    const l = await db.query<{ max_risk_per_trade_pct: string }>(`select max_risk_per_trade_pct::text from risk_limits where user_id='${U1}'`);
    expect(l.rows[0].max_risk_per_trade_pct).toBe("0.5000");
  });
  it("RLS: user cannot read another user's data", async () => {
    const r = (await as(U1, "authenticated", () => db.query(`select user_id from user_settings`))) as { rows: { user_id: string }[] };
    expect(r.rows.map((x) => x.user_id)).toEqual([U1]);
  });
  it("RLS: client cannot insert orders", async () => {
    await expect(as(U1, "authenticated", () => db.query(`insert into trade_orders (user_id, idempotency_key, mode, symbol, side, qty) values ('${U1}','k','paper','EURUSD','buy',1)`))).rejects.toThrow();
  });
  it("RLS: client cannot modify risk limits", async () => {
    const r = (await as(U1, "authenticated", () => db.query(`update risk_limits set max_daily_loss_pct = 20 where user_id='${U1}' returning 1`))) as { rows: unknown[] };
    expect(r.rows.length).toBe(0);
  });
  it("client cannot self-authorize live trading", async () => {
    await expect(as(U1, "authenticated", () => db.query(`update user_settings set live_trading_authorized = true where user_id='${U1}'`))).rejects.toThrow(/server/);
    await expect(as(U1, "authenticated", () => db.query(`update user_settings set trading_mode = 'live' where user_id='${U1}'`))).rejects.toThrow(/server/);
  });
  it("client can switch research<->paper", async () => {
    await as(U1, "authenticated", () => db.query(`update user_settings set trading_mode = 'paper' where user_id='${U1}'`));
    const s = await db.query<{ trading_mode: string }>(`select trading_mode from user_settings where user_id='${U1}'`);
    expect(s.rows[0].trading_mode).toBe("paper");
  });
  it("audit logs are append-only", async () => {
    await expect(db.query(`delete from audit_logs`)).rejects.toThrow(/append-only/);
  });
  it("risk limit hard caps enforced by constraints", async () => {
    await expect(db.query(`update risk_limits set max_risk_per_trade_pct = 50 where user_id='${U1}'`)).rejects.toThrow();
  });
  it("idempotency key unique per user", async () => {
    await db.query(`insert into trade_orders (user_id, idempotency_key, mode, symbol, side, qty) values ('${U1}','dup','paper','EURUSD','buy',1)`);
    await expect(db.query(`insert into trade_orders (user_id, idempotency_key, mode, symbol, side, qty) values ('${U1}','dup','paper','EURUSD','buy',1)`)).rejects.toThrow();
  });
});
