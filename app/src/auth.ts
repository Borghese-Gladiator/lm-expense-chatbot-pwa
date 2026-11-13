import { timingSafeEqual } from "node:crypto";

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * One shared password for the whole app (fewer than 10 users).
 * - Browser: HTTP Basic auth, any user name, password = APP_PASSWORD.
 * - Vercel Cron: `Authorization: Bearer CRON_SECRET`, only on /api/cron/*.
 * - No APP_PASSWORD on a Vercel deploy: refuse everything, so bank data is never public.
 */
export function authorize(req: Request, env: NodeJS.ProcessEnv = process.env): Response | null {
  const header = req.headers.get("authorization") ?? "";
  const path = new URL(req.url).pathname;
  if (path.startsWith("/api/cron/")) {
    if (env.CRON_SECRET && same(header, `Bearer ${env.CRON_SECRET}`)) return null;
    return new Response("unauthorized", { status: 401 });
  }
  const password = env.APP_PASSWORD;
  if (!password) {
    if (env.VERCEL) return new Response("set APP_PASSWORD to use Spend Lens", { status: 503 });
    return null;
  }
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    if (same(decoded.slice(decoded.indexOf(":") + 1), password)) return null;
  }
  return new Response("sign in required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Spend Lens", charset="UTF-8"' },
  });
}
