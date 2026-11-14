import { requireUser } from "@/lib/supabase/server";
import { D, ZERO } from "@/core/money/decimal";
import { capitalSummary, type TxType } from "@/core/portfolio/performance";
import { PageHeader, Section, Stat, Empty, money } from "@/components/ui";
import { AllocationPie } from "@/components/Charts";
import { TxForm } from "./TxForm";

export default async function Portfolio() {
  const { sb, user } = (await requireUser())!;
  const [{ data: ports }, { data: txs }] = await Promise.all([
    sb.from("portfolios").select("id,name,kind").eq("user_id", user.id),
    sb.from("investment_transactions").select("*").eq("user_id", user.id).order("occurred_at", { ascending: false }),
  ]);
  const lt = (ports ?? []).filter((p) => p.kind === "long_term");
  const ltTx = (txs ?? []).filter((t) => lt.some((p) => p.id === t.portfolio_id));
  // Holdings at cost (no live price feed for long-term assets yet).
  const holdings = new Map<string, { qty: ReturnType<typeof D>; cost: ReturnType<typeof D> }>();
  let cash = ZERO;
  for (const t of [...ltTx].reverse()) {
    const amt = D(t.amount);
    if (t.type === "deposit" || t.type === "dividend") cash = cash.plus(amt);
    if (t.type === "withdrawal" || t.type === "fee") cash = cash.minus(amt);
    if (t.type === "buy" && t.symbol) { cash = cash.minus(amt); const h = holdings.get(t.symbol) ?? { qty: ZERO, cost: ZERO }; holdings.set(t.symbol, { qty: h.qty.plus(t.qty ?? 0), cost: h.cost.plus(amt) }); }
    if (t.type === "sell" && t.symbol) { cash = cash.plus(amt); const h = holdings.get(t.symbol); if (h && !h.qty.isZero()) { const q = D(t.qty ?? 0); const avg = h.cost.div(h.qty); holdings.set(t.symbol, { qty: h.qty.minus(q), cost: h.cost.minus(avg.times(q)) }); } }
  }
  const invested = [...holdings.values()].reduce((a, h) => a.plus(h.cost), ZERO);
  const summary = capitalSummary(ltTx.map((t) => ({ type: t.type as TxType, amount: D(t.amount), at: new Date(t.occurred_at) })), cash.plus(invested), ZERO);
  return (
    <>
      <PageHeader title="Portfolio" subtitle="Long-term investment records, separate from active trading capital. Holdings valued at cost until a verified price source is connected." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net contributions" value={money(summary.netContributions.toString())} sub="deposits − withdrawals (not returns)" />
        <Stat label="Available cash" value={money(cash.toString())} />
        <Stat label="Invested capital (cost)" value={money(invested.toString())} />
        <Stat label="Dividends / fees" value={`${money(summary.dividends.toString())} / ${money(summary.fees.toString())}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Record transaction">{lt.length ? <TxForm portfolios={lt} /> : <Empty>No long-term portfolio.</Empty>}</Section>
        <Section title="Allocation (at cost)">{invested.gt(0) || cash.gt(0) ? <AllocationPie data={[...[...holdings].filter(([, h]) => h.cost.gt(0)).map(([s, h]) => ({ name: s, value: h.cost.toNumber() })), { name: "Cash", value: Math.max(0, cash.toNumber()) }]} /> : <Empty>No holdings recorded.</Empty>}</Section>
      </div>
      <div className="mt-4"><Section title="Transactions">{ltTx.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>Date</th><th>Type</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Amount</th><th>Note</th></tr></thead><tbody>{ltTx.map((t) => <tr key={t.id}><td className="num text-xs">{new Date(t.occurred_at).toLocaleDateString()}</td><td>{t.type}</td><td>{t.symbol ?? ""}</td><td className="num">{t.qty ?? ""}</td><td className="num">{t.price ?? ""}</td><td className="num">{money(t.amount)}</td><td className="text-xs text-dim">{t.note}</td></tr>)}</tbody></table></div> : <Empty>No transactions.</Empty>}</Section></div>
      <p className="mt-4 text-xs text-dim">Automatic reinvestment and rebalancing execution are not enabled. Rebalancing proposals will require a separately authorized policy.</p>
    </>
  );
}
