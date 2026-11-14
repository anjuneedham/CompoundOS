"use client";
import { useState, useTransition } from "react";
import { backtest, createStrategy, toggleStrategy, newStrategyVersion } from "@/server/actions";
import { EquityChart } from "@/components/Charts";

type Def = { kind: string; description: string; defaults: Record<string, number> };
type Strat = { id: string; name: string; kind: string; symbols: string[]; is_active: boolean; params: Record<string, number>; version: number };
type Bt = Awaited<ReturnType<typeof backtest>>;

function Metrics({ m, title }: { m: Bt["inSample"]["metrics"]; title: string }) {
  const rows: [string, string][] = [["Trades", String(m.trades)], ["Win rate", (m.winRate * 100).toFixed(1) + "%"], ["Profit factor", m.profitFactor?.toFixed(2) ?? "—"], ["Net profit", m.netProfit], ["Fees", m.fees], ["Max drawdown", m.maxDrawdownPct.toFixed(2) + "%"], ["Expectancy (R)", m.expectancyR.toFixed(3)], ["Avg reward/risk", m.avgRewardRisk?.toFixed(2) ?? "—"], ["Exposure", m.exposurePct.toFixed(1) + "%"]];
  return <div><div className="label mb-1">{title}</div><table className="data"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="text-dim">{k}</td><td className="num text-right">{v}</td></tr>)}</tbody></table></div>;
}

export function StrategyLab({ defs, symbols, strategies }: { defs: Def[]; symbols: string[]; strategies: Strat[] }) {
  const [kind, setKind] = useState(defs[0].kind);
  const def = defs.find((d) => d.kind === kind)!;
  const [params, setParams] = useState<Record<string, number>>(def.defaults);
  const [syms, setSyms] = useState<string[]>([symbols[0]]);
  const [name, setName] = useState("");
  const [bars, setBars] = useState(2000);
  const [bt, setBt] = useState<Bt | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-3">
        <div className="text-sm font-semibold">Strategy builder</div>
        <select className="input" value={kind} onChange={(e) => { setKind(e.target.value); setParams(defs.find((d) => d.kind === e.target.value)!.defaults); }}>{defs.map((d) => <option key={d.kind} value={d.kind}>{d.kind}</option>)}</select>
        <p className="text-xs text-dim">{def.description}</p>
        <div className="grid grid-cols-2 gap-2">{Object.entries(params).map(([k, v]) => <label key={k} className="text-xs text-dim">{k}<input className="input num" type="number" step="any" value={v} onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })} /></label>)}</div>
        <div className="label">Instruments</div>
        <div className="flex flex-wrap gap-2">{symbols.map((s) => <label key={s} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={syms.includes(s)} onChange={(e) => setSyms(e.target.checked ? [...syms, s] : syms.filter((x) => x !== s))} />{s}</label>)}</div>
        <label className="text-xs text-dim">Backtest bars (1h)<input className="input num" type="number" min={300} max={5000} value={bars} onChange={(e) => setBars(Number(e.target.value))} /></label>
        <button className="btn w-full" disabled={pending || !syms.length} onClick={() => run(async () => setBt(await backtest({ kind, symbol: syms[0], params, bars })))}>Backtest on {syms[0] ?? "—"}</button>
        <input className="input" placeholder="Strategy name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary w-full" disabled={pending || name.length < 2 || !syms.length} onClick={() => run(async () => { await createStrategy({ name, kind, symbols: syms, params }); setName(""); })}>Save strategy (inactive)</button>
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
      <div className="card lg:col-span-2">
        <div className="mb-2 text-sm font-semibold">Backtest results</div>
        {!bt ? <p className="text-sm text-dim">Run a backtest. Data: simulated hourly feed. Costs include spread, slippage and per-unit fees; entries fill at next bar open (no look-ahead); a bar touching both stop and target counts as a stop.</p> : (
          <div className="space-y-4">
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-xs text-warn">In-sample results alone do not indicate profitability. Judge by out-of-sample and walk-forward results, on real data, with paper trading before any live use.</div>
            <div className="grid gap-4 md:grid-cols-2"><Metrics m={bt.inSample.metrics} title="In-sample (70%)" /><Metrics m={bt.outOfSample.metrics} title="Out-of-sample (30%)" /></div>
            <div><div className="label mb-1">Out-of-sample equity curve</div><EquityChart data={bt.outOfSample.curve} height={200} /></div>
            <div><div className="label mb-1">Walk-forward (best params chosen on train, tested on unseen segment)</div>
              <table className="data"><thead><tr><th>Window</th><th>Train net</th><th>Test net</th><th>Test trades</th></tr></thead><tbody>{bt.walkForward.map((w) => <tr key={w.window}><td>{w.window + 1}</td><td className="num">{w.trainNet}</td><td className={`num ${Number(w.testNet) >= 0 ? "text-accent" : "text-bad"}`}>{w.testNet}</td><td className="num">{w.testTrades}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </div>
      <div className="card lg:col-span-3">
        <div className="mb-2 text-sm font-semibold">Your strategies</div>
        {!strategies.length ? <p className="text-sm text-dim">No strategies yet.</p> : (
          <div className="overflow-x-auto"><table className="data"><thead><tr><th>Name</th><th>Kind</th><th>Instruments</th><th>Version</th><th>Params</th><th>Status</th><th></th></tr></thead><tbody>
            {strategies.map((s) => <tr key={s.id}><td>{s.name}</td><td className="text-dim">{s.kind}</td><td>{s.symbols.join(", ")}</td><td className="num">v{s.version}</td><td className="num text-xs text-dim">{JSON.stringify(s.params)}</td><td>{s.is_active ? <span className="text-accent">active</span> : <span className="text-dim">inactive</span>}</td>
              <td className="flex flex-wrap gap-2"><button className="btn" disabled={pending} onClick={() => run(() => toggleStrategy(s.id, !s.is_active))}>{s.is_active ? "Deactivate" : "Activate"}</button>
                <button className="btn" disabled={pending} onClick={() => run(async () => setBt(await backtest({ kind: s.kind, symbol: s.symbols[0], params: s.params, bars, strategyId: s.id })))}>Backtest & save</button>
                {s.kind === kind && <button className="btn" disabled={pending} onClick={() => run(() => newStrategyVersion(s.id, params))}>Save builder params as v{s.version + 1}</button>}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
