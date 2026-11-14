import { requireUser } from "@/lib/supabase/server";
import { SIM_SYMBOLS } from "@/core/market/simulated";
import { Section, Empty, Badge, PageHeader } from "@/components/ui";
import { AiPanel } from "./AiPanel";

export default async function Ai() {
  const { sb, user } = (await requireUser())!;
  const [{ data: s }, { data: assess }, { data: props }, { data: logs }] = await Promise.all([
    sb.from("user_settings").select("trading_mode,ai_daily_token_budget").eq("user_id", user.id).single(),
    sb.from("ai_market_assessments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    sb.from("ai_trade_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("ai_decision_logs").select("capability,ok,error,model,input_tokens,output_tokens,cached,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const configured = !!process.env.ANTHROPIC_API_KEY;
  const latest = assess?.[0];
  return (
    <>
      <PageHeader title="AI Intelligence" subtitle="Claude provides research and advisory proposals. It cannot place orders or change risk limits; every proposal is validated by the deterministic risk engine." />
      {!configured && <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">ANTHROPIC_API_KEY is not configured on the server. AI features are unavailable; all risk controls and paper trading continue to work.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Run research"><AiPanel symbols={SIM_SYMBOLS} mode={s?.trading_mode ?? "research"} /><p className="mt-2 text-xs text-dim">Daily token budget: {s?.ai_daily_token_budget?.toLocaleString()}. Identical requests within 15 minutes are served from cache.</p></Section>
        <Section title="Latest market assessment">{latest ? <div className="space-y-2 text-sm"><div className="flex gap-2"><Badge tone="info">{latest.symbol}</Badge><Badge>{latest.regime}</Badge><Badge>{latest.volatility} vol</Badge><Badge>conf {Number(latest.confidence).toFixed(2)}</Badge></div><p className="text-dim">{latest.summary}</p></div> : <Empty>No assessments yet.</Empty>}</Section>
      </div>
      <div className="mt-4 grid gap-4">
        <Section title="Proposals (approved and rejected, with explanations)">
          {props?.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>Time</th><th>Symbol</th><th>Action</th><th>Entry/SL/TP</th><th>Rationale</th><th>Risk engine</th></tr></thead><tbody>
            {props.map((p) => <tr key={p.id}><td className="num text-xs">{new Date(p.created_at).toLocaleString()}</td><td>{p.symbol}</td><td>{p.action === "no_trade" ? "no trade" : p.side}</td><td className="num text-xs">{p.entry_price ?? "—"} / {p.stop_loss ?? "—"} / {p.take_profit ?? "—"}</td><td className="max-w-md text-xs text-dim">{p.rationale}</td><td>{p.risk_approved == null ? <Badge>not submitted</Badge> : p.risk_approved ? <Badge tone="good">approved</Badge> : <><Badge tone="bad">rejected</Badge><div className="mt-1 text-xs text-dim">{p.rejection_reasons?.join("; ")}</div></>}</td></tr>)}
          </tbody></table></div> : <Empty>No proposals yet.</Empty>}
        </Section>
        <Section title="Research history">{assess?.length ? <ul className="space-y-2 text-sm">{assess.map((a) => <li key={a.id}><span className="num text-xs text-dim">{new Date(a.created_at).toLocaleString()}</span> <Badge tone="info">{a.symbol}</Badge> <Badge>{a.regime}</Badge> <span className="text-dim">{a.summary}</span></li>)}</ul> : <Empty>No research yet.</Empty>}</Section>
        <Section title="AI call log">{logs?.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>Time</th><th>Capability</th><th>Result</th><th>Tokens in/out</th><th>Model</th></tr></thead><tbody>{logs.map((l, i) => <tr key={i}><td className="num text-xs">{new Date(l.created_at).toLocaleString()}</td><td>{l.capability}</td><td>{l.ok ? <Badge tone="good">{l.cached ? "cached" : "ok"}</Badge> : <Badge tone="bad">{l.error?.slice(0, 60)}</Badge>}</td><td className="num">{l.input_tokens}/{l.output_tokens}</td><td className="text-xs text-dim">{l.model}</td></tr>)}</tbody></table></div> : <Empty>No AI calls yet.</Empty>}</Section>
      </div>
    </>
  );
}
