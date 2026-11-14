"use client";
import { useState, useTransition } from "react";
import { addInvestmentTx } from "@/server/actions";

export function TxForm({ portfolios }: { portfolios: { id: string; name: string }[] }) {
  const [f, setF] = useState({ portfolio_id: portfolios[0]?.id ?? "", type: "deposit", symbol: "", qty: "", price: "", amount: "", note: "" });
  const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const trade = f.type === "buy" || f.type === "sell";
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { try { await addInvestmentTx({ ...f, symbol: f.symbol || undefined, qty: f.qty || undefined, price: f.price || undefined, note: f.note || undefined }); setMsg("Recorded"); setF({ ...f, amount: "", qty: "", price: "", symbol: "" }); } catch (err) { setMsg((err as Error).message); } }); }}>
      <select className="input" value={f.portfolio_id} onChange={set("portfolio_id")}>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className="input" value={f.type} onChange={set("type")}>{["deposit", "withdrawal", "buy", "sell", "dividend", "fee"].map((t) => <option key={t}>{t}</option>)}</select>
      {trade && <><input className="input" placeholder="Symbol" value={f.symbol} onChange={set("symbol")} /><input className="input num" placeholder="Quantity" inputMode="decimal" value={f.qty} onChange={set("qty")} /><input className="input num" placeholder="Price" inputMode="decimal" value={f.price} onChange={set("price")} /></>}
      <input className="input num" required placeholder="Amount (cash value)" inputMode="decimal" value={f.amount} onChange={set("amount")} />
      <input className="input sm:col-span-2" placeholder="Note (optional)" value={f.note} onChange={set("note")} />
      <button className="btn-primary sm:col-span-2" disabled={pending}>Record transaction</button>
      {msg && <p className="text-sm text-dim sm:col-span-2">{msg}</p>}
    </form>
  );
}
