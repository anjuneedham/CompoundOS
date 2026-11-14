"use client";
import { useState, useTransition } from "react";

export function ActionButton({ action, label, variant = "btn", confirm, prompt }: { action: (arg?: string) => Promise<unknown>; label: string; variant?: "btn" | "btn-primary" | "btn-danger"; confirm?: string; prompt?: string }) {
  const [pending, start] = useTransition();
  const [out, setOut] = useState<string>("");
  return (
    <div className="inline-flex flex-col gap-1">
      <button className={variant} disabled={pending} onClick={() => {
        let arg: string | undefined;
        if (confirm && !window.confirm(confirm)) return;
        if (prompt) { arg = window.prompt(prompt) ?? undefined; if (!arg) return; }
        start(async () => {
          try { const r = await action(arg); setOut(Array.isArray(r) ? r.join("\n") || "Done" : "Done"); }
          catch (e) { setOut(`Error: ${(e as Error).message}`); }
        });
      }}>{pending ? "Working…" : label}</button>
      {out && <pre className="max-w-xl whitespace-pre-wrap text-xs text-dim">{out}</pre>}
    </div>
  );
}
