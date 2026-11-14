"use client";
import { useState, useTransition } from "react";
import { runAi } from "@/server/actions";

export function AiPanel({ symbols, mode }: { symbols: string[]; mode: string }) {
  const [sym, setSym] = useState(symbols[0]); const [exec, setExec] = useState(false);
  const [pending, start] = useTransition(); const [res, setRes] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={sym} onChange={(e) => setSym(e.target.value)}>{symbols.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="flex items-center gap-2 text-sm text-dim"><input type="checkbox" checked={exec} disabled={mode !== "paper"} onChange={(e) => setExec(e.target.checked)} /> Send proposal to paper risk engine {mode !== "paper" && "(paper mode only)"}</label>
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => setRes(await runAi(sym, exec)))}>{pending ? "Analysing…" : "Run analysis"}</button>
      </div>
      {res && <pre className="max-h-96 overflow-auto rounded-lg bg-bg p-3 text-xs">{JSON.stringify(res, null, 2)}</pre>}
    </div>
  );
}
