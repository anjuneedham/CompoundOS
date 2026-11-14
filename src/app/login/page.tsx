"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  async function go(kind: "in" | "up") {
    setBusy(true); setMsg("");
    const sb = supabaseBrowser();
    const r = kind === "in" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (r.error) return setMsg(r.error.message);
    if (kind === "up" && !r.data.session) return setMsg("Check your email to confirm your account.");
    location.href = "/";
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form className="card w-full max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); go("in"); }}>
        <div className="text-lg font-semibold">Compound<span className="text-accent">OS</span></div>
        <p className="text-sm text-dim">Protect capital first. Sign in to your investment operating system.</p>
        <input className="input" type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" required minLength={8} autoComplete="current-password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy}>Sign in</button><button type="button" className="btn flex-1" disabled={busy} onClick={() => go("up")}>Create account</button></div>
        {msg && <p className="text-sm text-warn">{msg}</p>}
      </form>
    </div>
  );
}
