import { requireUser } from "@/lib/supabase/server";
import { STRATEGIES } from "@/core/strategy/types";
import { SIM_SYMBOLS } from "@/core/market/simulated";
import { PageHeader, Section, Empty } from "@/components/ui";
import { StrategyLab } from "./StrategyLab";

export default async function Strategies() {
  const { sb, user } = (await requireUser())!;
  const [{ data }, { data: perf }] = await Promise.all([
    sb.from("trading_strategies").select("id,name,kind,symbols,is_active,strategy_versions(id,version,params)").eq("user_id", user.id).order("created_at"),
    sb.from("strategy_performance").select("kind,metrics,created_at,strategy_versions(version,trading_strategies(name))").eq("user_id", user.id).neq("kind", "walk_forward").order("created_at", { ascending: false }).limit(20),
  ]);
  const strategies = (data ?? []).map((s) => { const v = ((s.strategy_versions as { version: number; params: Record<string, number> }[]) ?? []).sort((a, b) => b.version - a.version)[0]; return { id: s.id, name: s.name, kind: s.kind, symbols: s.symbols, is_active: s.is_active, params: v?.params ?? {}, version: v?.version ?? 0 }; });
  const defs = Object.values(STRATEGIES).map((d) => ({ kind: d.kind, description: d.description, defaults: d.defaults }));
  return (
    <>
      <PageHeader title="Strategy laboratory" subtitle="Strategies generate signals only. They never submit orders directly." />
      <StrategyLab defs={defs} symbols={SIM_SYMBOLS} strategies={strategies} />
      <div className="mt-4"><Section title="Version comparison (saved backtests)">
        {perf?.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>Time</th><th>Strategy</th><th>Version</th><th>Sample</th><th>Trades</th><th>Win%</th><th>PF</th><th>Net</th><th>MaxDD</th></tr></thead><tbody>
          {perf.map((p, i) => { const m = p.metrics as Record<string, number | string | null>; const sv = p.strategy_versions as unknown as { version: number; trading_strategies: { name: string } }; return <tr key={i}><td className="num text-xs">{new Date(p.created_at).toLocaleString()}</td><td>{sv?.trading_strategies?.name}</td><td>v{sv?.version}</td><td className="text-dim">{p.kind.replace("backtest_", "")}</td><td className="num">{m.trades}</td><td className="num">{(Number(m.winRate) * 100).toFixed(1)}</td><td className="num">{m.profitFactor == null ? "—" : Number(m.profitFactor).toFixed(2)}</td><td className="num">{m.netProfit}</td><td className="num">{Number(m.maxDrawdownPct).toFixed(2)}%</td></tr>; })}
        </tbody></table></div> : <Empty>Use “Backtest & save” on a strategy to record results per version.</Empty>}
      </Section></div>
    </>
  );
}
