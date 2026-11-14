"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  ["/", "Overview"], ["/trading", "Trading"], ["/ai", "AI Intelligence"], ["/strategies", "Strategies"], ["/portfolio", "Portfolio"],
  ["/risk", "Risk Centre"], ["/brokers", "Broker Connections"], ["/performance", "Performance"], ["/activity", "Activity"], ["/settings", "Settings"],
] as const;

export function Nav({ mode, halted }: { mode: string; halted: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = NAV.map(([href, label]) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return <Link key={href} href={href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 text-sm ${active ? "bg-panel2 text-ink" : "text-dim hover:text-ink"}`}>{label}</Link>;
  });
  const status = (
    <div className="space-y-1 px-3 text-xs">
      <div className="flex justify-between"><span className="text-dim">Mode</span><span className={mode === "paper" ? "text-accent" : "text-info"}>{mode.toUpperCase()}</span></div>
      <div className="flex justify-between"><span className="text-dim">Trading</span><span className={halted ? "text-bad" : "text-accent"}>{halted ? "HALTED" : "ACTIVE"}</span></div>
      <div className="flex justify-between"><span className="text-dim">Live</span><span className="text-dim">DISABLED</span></div>
    </div>
  );
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-semibold tracking-tight">Compound<span className="text-accent">OS</span></span>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation">Menu</button>
      </header>
      {open && <div className="border-b border-line bg-panel p-3 lg:hidden">{links}<div className="mt-3">{status}</div></div>}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel p-3 lg:flex">
        <div className="px-3 py-3 text-lg font-semibold tracking-tight">Compound<span className="text-accent">OS</span></div>
        <nav className="mt-2 flex-1 space-y-0.5">{links}</nav>
        {status}
        <form action="/auth/signout" method="post" className="mt-3 px-3"><button className="text-xs text-dim hover:text-ink">Sign out</button></form>
      </aside>
    </>
  );
}
