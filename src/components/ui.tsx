import type { ReactNode } from "react";

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn" }) {
  const c = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${c}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-dim">{sub}</div>}
    </div>
  );
}
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-dim">{children}</div>;
}
export function Badge({ children, tone = "dim" }: { children: ReactNode; tone?: "good" | "bad" | "warn" | "info" | "dim" }) {
  const m = { good: "bg-accent/15 text-accent", bad: "bg-bad/15 text-bad", warn: "bg-warn/15 text-warn", info: "bg-info/15 text-info", dim: "bg-line text-dim" }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${m}`}>{children}</span>;
}
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}</div>
      {right}
    </div>
  );
}
export const money = (v: string | number | null | undefined, dp = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const pnlTone = (v: string | number) => (Number(v) > 0 ? "good" : Number(v) < 0 ? "bad" : undefined);
export const SimBanner = () => (
  <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
    Paper trading on a <b>simulated</b> market feed. No real money, no live broker. Figures reflect simulated activity only.
  </div>
);
