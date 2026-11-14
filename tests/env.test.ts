import { describe, it, expect, beforeEach } from "vitest";
import { publicEnv, serverEnv, supabaseSecretKey, supabasePublicKey } from "@/lib/env";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
beforeEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("Supabase key configuration", () => {
  it("prefers new secret/publishable keys", () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_aaaaaaaaaaaaaaaa", NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-xxxxxxxxxxxx", SUPABASE_SECRET_KEY: "sb_secret_bbbbbbbbbbbbbbbbbbbb", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-xxxxxxxxxx", CRON_SECRET: "c".repeat(32) });
    expect(supabasePublicKey()).toMatch(/^sb_publishable_/);
    expect(supabaseSecretKey()).toMatch(/^sb_secret_/);
    expect(serverEnv().ok).toBe(true);
  });
  it("falls back to legacy anon/service_role keys", () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-xxxxxxxxxxxx", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-xxxxxxxxxx", CRON_SECRET: "c".repeat(32) });
    expect(serverEnv().ok).toBe(true);
  });
  it("refuses a secret key in a public variable", () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_oops_oops_oops" });
    expect(() => publicEnv()).toThrow(/SECRET/);
  });
  it("rejects a publishable key in the secret slot and reports names only", () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_aaaaaaaaaaaaaaaa", SUPABASE_SECRET_KEY: "sb_publishable_aaaaaaaaaaaaaaaa" });
    const r = serverEnv();
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.missing).toContain("SUPABASE_SECRET_KEY"); expect(JSON.stringify(r)).not.toContain("sb_publishable_aaaa"); }
  });
});
