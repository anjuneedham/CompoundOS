import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/setup", "/api/cron", "/api/health", "/auth"];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = req.nextUrl.pathname;
  if (!url || !key) return path.startsWith("/setup") || path.startsWith("/api/health") ? NextResponse.next() : NextResponse.redirect(new URL("/setup", req.url));
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user && !PUBLIC.some((p) => path.startsWith(p))) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
