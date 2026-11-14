import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  if (!u) redirect("/login");
  const [{ data: s }, { data: h }] = await Promise.all([
    u.sb.from("user_settings").select("trading_mode").eq("user_id", u.user.id).single(),
    u.sb.from("trading_halts").select("id").eq("user_id", u.user.id).eq("active", true).limit(1),
  ]);
  return (
    <div className="lg:flex">
      <Nav mode={s?.trading_mode ?? "research"} halted={(h ?? []).length > 0} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
