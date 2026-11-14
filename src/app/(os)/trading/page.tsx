import { requireUser } from "@/lib/supabase/server";
import { paperSnapshot } from "@/server/queries";
import { simulatedCandles, SIM_SYMBOLS } from "@/core/market/simulated";
import { Section, Empty, Badge, PageHeader, money, SimBanner } from "@/components/ui";
import { PriceChart } from "@/components/Charts";

export default async function Trading() {
  const { sb, user } = (await requireUser())!;
  const [snap, { data: orders }, { data: proposals }] = await Promise.all([
    paperSnapshot(sb, user.id),
    sb.from("trade_orders").select("idempotency_key,symbol,side,qty,status,rejection_reasons,attempts,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    sb.from("ai_trade_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const quotes = SIM_SYMBOLS.map((s) => { const c = simulatedCandles(s, Date.now(), 72); const last = c.at(-1)!, prev = c.at(-25)!; return { s, last: last.close, chg: ((last.close - prev.close) / prev.close) * 100, series: c.map((x) => ({ t: new Date(x.time).toISOString().slice(5, 13).replace("T", " "), close: +x.close.toFixed(5) })) }; });
  const tone = (s: string) => (s === "filled" ? "good" : s === "risk_rejected" || s === "rejected" ? "bad" : s === "unknown" ? "warn" : "dim");
  return (
    <>
      <PageHeader title="Trading terminal" subtitle="Simulated market prices, positions and the order lifecycle. Orders are created only by the backend engine after risk validation." />
      <SimBanner />
      <div className="grid gap-3 md:grid-cols-3">
        {quotes.map((q) => (
          <Section key={q.s} title={q.s} right={<span className={`num text-sm ${q.chg >= 0 ? "text-accent" : "text-bad"}`}>{q.last.toFixed(q.s === "SYN100" ? 2 : 5)} ({q.chg.toFixed(2)}% 24h)</span>}>
            <PriceChart data={q.series} />
          </Section>
        ))}
      </div>
      <div className="mt-4 grid gap-4">
        <Section title="Open positions">
          {snap?.positions.length ? (
            <div className="overflow-x-auto"><table className="data"><thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Mark</th><th>Stop</th><th>Target</th><th>Unrealized</th></tr></thead><tbody>
              {snap.positions.map((p) => <tr key={p.id}><td>{p.symbol}</td><td><Badge tone={p.side === "buy" ? "good" : "bad"}>{p.side}</Badge></td><td className="num">{p.qty.toString()}</td><td className="num">{p.entryPrice.toString()}</td><td className="num">{p.mark.toFixed(5)}</td><td className="num">{p.stopLoss?.toString() ?? "—"}</td><td className="num">{p.takeProfit?.toString() ?? "—"}</td><td className={`num ${p.unrealized.gte(0) ? "text-accent" : "text-bad"}`}>{money(p.unrealized.toString())}</td></tr>)}
            </tbody></table></div>
          ) : <Empty>No open positions.</Empty>}
        </Section>
        <Section title="Order history (paper)">
          {orders?.length ? (
            <div className="overflow-x-auto"><table className="data"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Status</th><th>Attempts</th><th>Risk notes</th></tr></thead><tbody>
              {orders.map((o) => <tr key={o.idempotency_key}><td className="num text-xs">{new Date(o.created_at).toLocaleString()}</td><td>{o.symbol}</td><td>{o.side}</td><td className="num">{Number(o.qty)}</td><td><Badge tone={tone(o.status)}>{o.status}</Badge></td><td className="num">{o.attempts}</td><td className="text-xs text-dim">{o.rejection_reasons?.join("; ")}</td></tr>)}
            </tbody></table></div>
          ) : <Empty>No orders yet. Pending orders appear here while submission is in progress.</Empty>}
        </Section>
        <Section title="Recent AI trade proposals">
          {proposals?.length ? <ul className="space-y-2 text-sm">{proposals.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2"><Badge tone="info">{p.symbol}</Badge><span>{p.action === "no_trade" ? "No trade" : `${p.side} @ ${Number(p.entry_price)} SL ${Number(p.stop_loss)}`}</span>{p.risk_approved === true && <Badge tone="good">risk approved</Badge>}{p.risk_approved === false && <Badge tone="bad">risk rejected</Badge>}<span className="text-xs text-dim">{p.rejection_reasons?.join("; ")}</span></li>)}</ul> : <Empty>No AI proposals yet.</Empty>}
        </Section>
      </div>
    </>
  );
}
