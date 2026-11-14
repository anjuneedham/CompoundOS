import { requireUser } from "@/lib/supabase/server";
import { PageHeader, Section, Stat } from "@/components/ui";
import { SettingsForm, type Job } from "./SettingsForm";

// Opus 5.5 list prices (USD per million tokens). Update if pricing or model changes.
const PRICE_IN = 4, PRICE_OUT = 20;
const DEFAULTS: Job[] = [
  { job: "risk_monitor", enabled: false, interval_minutes: 15 },
  { job: "paper_cycle", enabled: false, interval_minutes: 60 },
  { job: "ai_research", enabled: false, interval_minutes: 240 },
  { job: "daily_report", enabled: false, interval_minutes: 1440 },
];

export default async function Settings() {
  const { sb, user } = (await requireUser())!;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: s }, { data: jobRows }, { data: usage }] = await Promise.all([
    sb.from("user_settings").select("*").eq("user_id", user.id).single(),
    sb.from("scheduled_jobs").select("job,enabled,interval_minutes").eq("user_id", user.id),
    sb.from("ai_decision_logs").select("input_tokens,output_tokens,cached,created_at").eq("user_id", user.id).gte("created_at", since),
  ]);
  const jobs = DEFAULTS.map((d) => ({ ...d, ...(jobRows ?? []).find((r) => r.job === d.job) })) as Job[];
  const today = new Date().toISOString().slice(0, 10);
  const tok = (rows: typeof usage) => (rows ?? []).reduce((a, r) => ({ i: a.i + r.input_tokens, o: a.o + r.output_tokens }), { i: 0, o: 0 });
  const t30 = tok(usage), tDay = tok((usage ?? []).filter((r) => r.created_at.startsWith(today)));
  const usd = (t: { i: number; o: number }) => ((t.i * PRICE_IN + t.o * PRICE_OUT) / 1e6).toFixed(2);
  const calls = (usage ?? []).filter((r) => !r.cached).length, cached = (usage ?? []).filter((r) => r.cached).length;
  return (
    <>
      <PageHeader title="Settings" subtitle={`Signed in as ${user.email}`} />
      <Section title="Trading, automation & schedules"><SettingsForm mode={s?.trading_mode ?? "research"} s={{ emergency_policy: s?.emergency_policy ?? "halt_only", ai_daily_token_budget: s?.ai_daily_token_budget ?? 200000 }} jobs={jobs} /></Section>
      <div className="mt-4"><Section title="Cost monitor (estimates)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Claude today" value={`$${usd(tDay)}`} sub={`${(tDay.i + tDay.o).toLocaleString()} / ${s?.ai_daily_token_budget?.toLocaleString()} tokens`} />
          <Stat label="Claude last 30 days" value={`$${usd(t30)}`} sub={`${calls} calls · ${cached} served from cache`} />
          <Stat label="Supabase" value="Plan-dependent" sub="free tier fine for 1 user; paid when you need no-pause/backups" />
          <Stat label="Hosting / data / broker" value="$0 now" sub="Vercel Hobby · simulated feed · mock broker" />
        </div>
        <p className="mt-2 text-xs text-dim">Claude estimate uses list prices ${PRICE_IN}/${PRICE_OUT} per million input/output tokens and excludes prompt-cache discounts. Check your Anthropic console for billed amounts.</p>
      </Section></div>
    </>
  );
}
