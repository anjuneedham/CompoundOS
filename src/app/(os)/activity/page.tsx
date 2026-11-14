import { requireUser } from "@/lib/supabase/server";
import { PageHeader, Section, Empty, Badge } from "@/components/ui";

const NOTIFY = new Set(["order_result", "risk_decision", "hard_limit_breach_halt", "broker_disconnected_halt", "kill_switch_activated", "order_outcome_unknown", "reconciliation_mismatch", "emergency_policy_applied"]);
export default async function Activity() {
  const { sb, user } = (await requireUser())!;
  const [{ data: audit }, { data: jobs }, { data: health }] = await Promise.all([
    sb.from("audit_logs").select("id,actor,action,detail,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(150),
    sb.from("scheduled_jobs").select("job,enabled,interval_minutes,last_run_at,last_status").eq("user_id", user.id),
    sb.from("system_health").select("component,status,checked_at").order("checked_at", { ascending: false }).limit(5),
  ]);
  return (
    <>
      <PageHeader title="Activity & system" subtitle="Append-only audit trail of every decision, order and setting change." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Scheduled jobs">{jobs?.length ? <table className="data"><tbody>{jobs.map((j) => <tr key={j.job}><td>{j.job}</td><td>{j.enabled ? <Badge tone="good">every {j.interval_minutes}m</Badge> : <Badge>disabled</Badge>}</td><td className="num text-xs text-dim">{j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "never"}</td><td className="text-xs text-dim">{j.last_status}</td></tr>)}</tbody></table> : <Empty>Automation is off. Enable it in Settings.</Empty>}</Section>
        <Section title="System health">{health?.length ? <ul className="text-sm">{health.map((h, i) => <li key={i}>{h.component}: <Badge tone={h.status === "ok" ? "good" : "warn"}>{h.status}</Badge> <span className="num text-xs text-dim">{new Date(h.checked_at).toLocaleString()}</span></li>)}</ul> : <Empty>No scheduler heartbeat recorded yet.</Empty>}</Section>
      </div>
      <div className="mt-4"><Section title="Audit log">{audit?.length ? <ul className="space-y-1 text-sm">{audit.map((a) => <li key={a.id} className="flex flex-wrap gap-2 border-b border-line/50 py-1"><span className="num text-xs text-dim">{new Date(a.created_at).toLocaleString()}</span><Badge tone={a.actor === "user" ? "info" : NOTIFY.has(a.action) ? "warn" : "dim"}>{a.actor}</Badge><span>{a.action}</span><span className="break-all text-xs text-dim">{JSON.stringify(a.detail).slice(0, 220)}</span></li>)}</ul> : <Empty>No activity.</Empty>}</Section></div>
    </>
  );
}
