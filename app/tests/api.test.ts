import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authorize, sessionToken } from "@/auth";
import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { decrypt, encrypt } from "@/server/crypto";
import { PlaidClient } from "@/server/plaid";

import { memoryDb } from "./helpers";

let ctx: Ctx;
beforeEach(async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings) };
});
afterEach(() => ctx.db.close());

async function call(method: string, path: string, body?: unknown) {
  const req = new Request(`http://test/api/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(ctx, req, path.split("/"));
}
const post = async (path: string, body: unknown = {}) => (await call("POST", path, body)).json();

it("runs the manual flow", async () => {
  const acct = (await post("accounts", { name: "Cash" })).id;
  const cat = (await post("categories", { name: "Coffee", group_name: "Food" })).id;
  expect((await call("POST", "categories", { name: "Coffee" })).status).toBe(409);

  const tid = (await post("transactions", { account_id: acct, date: "2026-10-01", amount: -4.5, payee: "Blue Bottle" })).id;
  expect((await post("transactions/search", { uncategorized: true })).total).toBe(1);

  await call("PATCH", `transactions/${tid}`, { category_id: cat, tags: ["work"] });
  const found = await post("transactions/search", { filters: { search: "blue" } });
  expect(found.items[0].category).toBe("Coffee");
  expect(found.items[0].tags).toEqual(["work"]);

  const detail = await (await call("GET", `transactions/${tid}`)).json();
  expect(detail.user_edited).toBe(true);
  expect(detail.raw.payee).toBe("Blue Bottle");

  const q = { dimensions: ["category_group"], filters: { start: "2026-10-01", end: "2026-10-31" } };
  expect((await post("analytics/query", q)).rows[0]).toEqual({ d0: "Food", value: 4.5, n: 1 });

  const csv = await (await call("POST", "transactions/export", {})).text();
  expect(csv.split("\r\n")[1].split(",").slice(2, 4)).toEqual(["Cash", "Blue Bottle"]);
});

it("round-trips saved queries", async () => {
  const id = (await post("saved-queries", { name: "Monthly food", query: { dimensions: ["month"], metric: "avg" } })).id;
  const saved = await (await call("GET", "saved-queries")).json();
  expect(saved[0].id).toBe(id);
  expect(saved[0].query.metric).toBe("avg");
  await call("DELETE", `saved-queries/${id}`);
  expect(await (await call("GET", "saved-queries")).json()).toEqual([]);
});

it("returns the right error codes", async () => {
  expect((await call("POST", "analytics/query", { metric: "cumulative" })).status).toBe(422);
  expect((await call("POST", "ask", { question: "how much?" })).status).toBe(503);
  expect((await call("POST", "plaid/link-token")).status).toBe(502);
  expect((await call("GET", "transactions/999")).status).toBe(404);
  expect((await call("GET", "nope")).status).toBe(404);
});

it("syncs no items on cron with no connections", async () => {
  expect(await (await call("GET", "cron/sync")).json()).toEqual({ items: [] });
});

it("round-trips token encryption", () => {
  const secret = "s".repeat(20);
  const enc = encrypt("access-sandbox-123", secret);
  expect(enc).not.toContain("access");
  expect(decrypt(enc, secret)).toBe("access-sandbox-123");
  expect(() => encrypt("x", "short")).toThrow(/APP_SECRET_KEY/);
});

describe("authorize", () => {
  const env = { APP_PASSWORD: "pw" } as unknown as NodeJS.ProcessEnv;
  const good = `sl_session=${sessionToken("pw")}`;
  const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://test${path}`, { headers });
  const login = (password: string) =>
    authorize(new Request("http://test/api/login", { method: "POST", body: JSON.stringify({ password }) }), env);

  it.each([
    ["local, no password", "/api/health", {}, {}, null],
    ["vercel, no password", "/api/health", {}, { VERCEL: "1" }, 503],
    ["api, no cookie", "/api/meta", {}, { APP_PASSWORD: "pw" }, 401],
    ["page, no cookie", "/", {}, { APP_PASSWORD: "pw" }, 307],
    ["login page is open", "/login", {}, { APP_PASSWORD: "pw" }, null],
    ["valid cookie", "/api/meta", { cookie: good }, { APP_PASSWORD: "pw" }, null],
    ["changed signature", "/api/meta", { cookie: `${good.slice(0, -2)}xx` }, { APP_PASSWORD: "pw" }, 401],
    ["cookie for another password", "/", { cookie: `sl_session=${sessionToken("old")}` }, { APP_PASSWORD: "pw" }, 307],
    ["expired cookie", "/api/meta", { cookie: `sl_session=${sessionToken("pw", Date.now() - 31 * 86400e3)}` }, { APP_PASSWORD: "pw" }, 401],
    ["cron, no secret set", "/api/cron/sync", { authorization: "Bearer x" }, { APP_PASSWORD: "pw" }, 401],
    ["cron, wrong secret", "/api/cron/sync", { authorization: "Bearer x" }, { CRON_SECRET: "cs" }, 401],
    ["cron, cookie is not enough", "/api/cron/sync", { cookie: good }, { APP_PASSWORD: "pw", CRON_SECRET: "cs" }, 401],
    ["cron, right secret", "/api/cron/sync", { authorization: "Bearer cs" }, { APP_PASSWORD: "pw", CRON_SECRET: "cs" }, null],
  ])("%s", async (_name, path, headers, e, status) => {
    expect((await authorize(req(path, headers), e as NodeJS.ProcessEnv))?.status ?? null).toBe(status);
  });

  it("redirects pages to /login and gives the API a plain 401", async () => {
    expect((await authorize(req("/"), env))?.headers.get("location")).toBe("http://test/login");
    expect((await authorize(req("/api/meta"), env))?.headers.get("www-authenticate")).toBeNull();
  });

  it("sets a 30-day secure cookie on the right password only", async () => {
    const ok = (await login("pw"))!;
    const set = ok.headers.get("set-cookie")!;
    expect(ok.status).toBe(200);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Lax/);
    const days = (Date.parse(/Expires=([^;]+)/.exec(set)![1]) - Date.now()) / 86400e3;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    const cookie = set.split(";")[0];
    expect(await authorize(req("/api/meta", { cookie }), env)).toBeNull();

    const bad = (await login("nope"))!;
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
  });

  it("clears the cookie on logout", async () => {
    const out = (await authorize(new Request("http://test/api/logout", { method: "POST", headers: { cookie: good } }), env))!;
    expect(out.headers.get("set-cookie")).toMatch(/^sl_session=;.*Max-Age=0/);
  });
});
