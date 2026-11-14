import { requireUser } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export default async function Settings() {
  const { sb, user } = (await requireUser())!;
  const [{ data: s }, { data: job }] = await Promise.all([
    sb.from("user_settings").select("*").eq("user_id", user.id).single(),
    sb.from("scheduled_jobs").select("enabled,interval_minutes").eq("user_id", user.id).eq("job", "paper_cycle").maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle={`Signed in as ${user.email}`} />
      <Section title="Trading & automation"><SettingsForm mode={s?.trading_mode ?? "research"} s={{ emergency_policy: s?.emergency_policy ?? "halt_only", ai_daily_token_budget: s?.ai_daily_token_budget ?? 200000, automation: job?.enabled ?? false, interval_minutes: job?.interval_minutes ?? 60 }} /></Section>
    </>
  );
}
