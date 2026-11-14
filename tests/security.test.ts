import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function walk(d: string): string[] { return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }

describe("secret exposure", () => {
  it("client components never import server-only modules or secret env vars", () => {
    const files = walk("src").filter((f) => /\.(tsx?|ts)$/.test(f));
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      if (!s.startsWith('"use client"')) continue;
      expect(s, f).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|CRON_SECRET/);
      expect(s, f).not.toMatch(/from "@\/lib\/supabase\/server"|@anthropic-ai\/sdk|core\/ai\/anthropic/);
    }
  });
  it("server modules are guarded with server-only", () => {
    for (const f of ["src/lib/supabase/server.ts", "src/server/paper.ts", "src/server/store.ts", "src/server/queries.ts"]) expect(readFileSync(f, "utf8")).toMatch(/import "server-only"/);
  });
  it("built client bundle contains no secret names (if built)", () => {
    const dir = ".next/static"; if (!existsSync(dir)) return;
    for (const f of walk(dir).filter((x) => x.endsWith(".js"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/SERVICE_ROLE|ANTHROPIC_API_KEY|CRON_SECRET/);
  });
  it(".env files are gitignored", () => { expect(readFileSync(".gitignore", "utf8")).toMatch(/\.env/); });
});
