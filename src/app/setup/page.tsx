export default function Setup() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">CompoundOS setup required</h1>
      <p className="mt-2 text-sm text-dim">The app is running but Supabase is not configured. Set these environment variables in Vercel (Project → Settings → Environment Variables) and redeploy. See DEPLOYMENT.md.</p>
      <ul className="num mt-4 space-y-1 text-sm">
        <li>NEXT_PUBLIC_SUPABASE_URL</li><li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li><li>SUPABASE_SERVICE_ROLE_KEY <span className="text-dim">(server only)</span></li>
        <li>CRON_SECRET <span className="text-dim">(server only)</span></li><li>ANTHROPIC_API_KEY <span className="text-dim">(server only, optional)</span></li>
      </ul>
    </div>
  );
}
