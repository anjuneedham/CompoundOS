"use client";
import { useState, useTransition } from "react";
import { reviewStrategy, reviewRisk, makeReport } from "@/server/actions";

export function ReviewPanel({ strategies }: { strategies: { id: string; name: string }[] }) {
  const [sid, setSid] = useState(strategies[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<unknown>(null);
  const go = (fn: () => Promise<unknown>) => start(async () => { try { setRes(await fn()); } catch (e) { setRes({ error: (e as Error).message }); } });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={sid} onChange={(e) => setSid(e.target.value)} disabled={!strategies.length}>{strategies.length ? strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option>No strategies</option>}</select>
        <button className="btn" disabled={pending || !sid} onClick={() => go(() => reviewStrategy(sid))}>Review strategy</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={() => go(reviewRisk)}>Risk review</button>
        {(["daily", "weekly", "monthly"] as const).map((p) => <button key={p} className="btn" disabled={pending} onClick={() => go(() => makeReport(p))}>{p[0].toUpperCase() + p.slice(1)} report</button>)}
      </div>
      {pending && <p className="text-sm text-dim">Working…</p>}
      {res != null && <pre className="max-h-96 overflow-auto rounded-lg bg-bg p-3 text-xs">{JSON.stringify(res, null, 2)}</pre>}
      <p className="text-xs text-dim">Reviews are advisory. The risk observer can log warnings but cannot change limits. Report figures are computed deterministically; Claude only writes the narrative.</p>
    </div>
  );
}
