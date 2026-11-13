import { createHmac, timingSafeEqual } from "node:crypto";

import { loadSettings } from "./server/config";

const COOKIE = "sl_session";
const MAX_AGE = 30 * 24 * 60 * 60;

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const sign = (exp: string, password: string) =>
  createHmac("sha256", password).update(`session:${exp}`).digest("base64url");

export function sessionToken(password: string, now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + MAX_AGE);
  return `${exp}.${sign(exp, password)}`;
}

function validSession(req: Request, password: string): boolean {
  const raw = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const [exp, sig] = raw?.split(".") ?? [];
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  return same(sig, sign(exp, password));
}

const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(
    Date.now() + maxAge * 1000,
  ).toUTCString()}`;

async function login(req: Request, password: string): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const given = typeof body?.password === "string" ? body.password : "";
  if (!same(given, password)) return Response.json({ detail: "wrong password" }, { status: 401 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie(sessionToken(password), MAX_AGE) } });
}

/**
 * One shared password for the whole app (fewer than 10 users).
 * - Browser: POST /api/login with APP_PASSWORD sets a signed session cookie for 30 days.
 * - Vercel Cron: `Authorization: Bearer CRON_SECRET`, only on /api/cron/*.
 * - No APP_PASSWORD on a Vercel deploy: refuse everything, so bank data is never public.
 */
export async function authorize(req: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (path.startsWith("/api/cron/")) {
    const { cronSecret } = loadSettings(env);
    if (cronSecret && same(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) return null;
    return new Response("unauthorized", { status: 401 });
  }
  const password = env.APP_PASSWORD;
  if (!password) {
    if (env.VERCEL) return new Response("set APP_PASSWORD to use Spend Lens", { status: 503 });
    return null;
  }
  if (path === "/api/login" && req.method === "POST") return login(req, password);
  if (path === "/api/logout" && req.method === "POST")
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie("", 0) } });
  if (path === "/login" || validSession(req, password)) return null;
  if (path.startsWith("/api/")) return Response.json({ detail: "sign in required" }, { status: 401 });
  return Response.redirect(new URL("/login", req.url), 307);
}
