import { requireUser } from "@/lib/supabase/server";
import { SIM_SYMBOLS } from "@/core/market/simulated";
import { Section, Empty, Badge, PageHeader } from "@/components/ui";
import { AiPanel } from "./AiPanel";
import { ReviewPanel } from "./ReviewPanel";

export default async function Ai() {
  const { sb, user } = (await requireUser())!;
  const [{ data: s }, { data: assess }, { data: props }, { data: logs }, { data: strats }, { data: reports }, { data: reviews }] = await Promise.all([
    sb.from("user_settings").select("trading_mode,ai_daily_token_budget").eq("user_id", user.id).single(),
    sb.from("ai_market_assessments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    sb.from("ai_trade_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("ai_decision_logs").select("capability,ok,error,model,input_tokens,output_tokens,cached,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("trading_strategies").select("id,name").eq("user_id", user.id).order("created_at"),
    sb.from("ai_research").select("id,output,created_at").eq("user_id", user.id).eq("capability", "report").order("created_at", { ascending: false }).limit(10),
    sb.from("ai_research").select("id,capability,output,created_at").eq("user_id", user.id).in("capability", ["strategy_analyst", "risk_observer"]).order("created_at", { ascending: false }).limit(10),
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
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Reviews & reports"><ReviewPanel strategies={strats ?? []} /></Section>
        <Section title="Strategy & risk observations">{reviews?.length ? <ul className="space-y-3 text-sm">{reviews.map((r) => { const o = r.output as { verdict?: string; severity?: string; observations?: string[] }; return <li key={r.id}><div className="flex flex-wrap gap-2"><span className="num text-xs text-dim">{new Date(r.created_at).toLocaleString()}</span><Badge tone="info">{r.capability === "strategy_analyst" ? "strategy" : "risk"}</Badge><Badge tone={o.severity === "critical" || o.verdict === "deteriorating" ? "bad" : o.severity === "warning" || o.verdict === "watch" ? "warn" : "dim"}>{o.verdict ?? o.severity}</Badge></div><ul className="mt-1 list-disc pl-5 text-dim">{(o.observations ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></li>; })}</ul> : <Empty>No reviews yet.</Empty>}</Section>
      </div>
      <div className="mt-4"><Section title="Reports">{reports?.length ? <ul className="space-y-4">{reports.map((r) => { const o = r.output as { figures: { period: string; paper: Record<string, string | number> | null; longTermPortfolio: Record<string, string> }; narrative: { headline: string; sections: { title: string; body: string }[] } | null; aiError: string | null }; return <li key={r.id} className="border-b border-line/60 pb-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="info">{o.figures.period}</Badge><span className="num text-xs text-dim">{new Date(r.created_at).toLocaleString()}</span>{o.narrative && <span className="text-sm font-medium">{o.narrative.headline}</span>}</div>
          {o.figures.paper && <div className="num mt-2 grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-4">{Object.entries(o.figures.paper).map(([k, v]) => <div key={k}><span className="text-dim">{k}</span> {String(v)}</div>)}</div>}
          {o.narrative?.sections.map((x, i) => <div key={i} className="mt-2 text-sm"><div className="font-medium">{x.title}</div><p className="text-dim">{x.body}</p></div>)}
          {o.aiError && <p className="mt-1 text-xs text-warn">No AI narrative: {o.aiError}</p>}</li>; })}</ul> : <Empty>No reports yet. Generate one above or enable the daily report schedule in Settings.</Empty>}</Section></div>
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
