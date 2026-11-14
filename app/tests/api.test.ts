import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authorize } from "@/auth";
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
  const req = (path: string, auth?: string) =>
    new Request(`http://test${path}`, { headers: auth ? { authorization: auth } : {} });
  const basic = (pw: string) => `Basic ${Buffer.from(`me:${pw}`).toString("base64")}`;

  it.each([
    ["local, no password", "/api/health", undefined, {}, null],
    ["vercel, no password", "/api/health", undefined, { VERCEL: "1" }, 503],
    ["no credentials", "/", undefined, { APP_PASSWORD: "pw" }, 401],
    ["wrong password", "/", basic("nope"), { APP_PASSWORD: "pw" }, 401],
    ["right password", "/api/meta", basic("pw"), { APP_PASSWORD: "pw" }, null],
    ["cron, no secret set", "/api/cron/sync", "Bearer x", { APP_PASSWORD: "pw" }, 401],
    ["cron, wrong secret", "/api/cron/sync", "Bearer x", { CRON_SECRET: "cs" }, 401],
    ["cron, password is not enough", "/api/cron/sync", basic("pw"), { APP_PASSWORD: "pw", CRON_SECRET: "cs" }, 401],
    ["cron, right secret", "/api/cron/sync", "Bearer cs", { CRON_SECRET: "cs" }, null],
  ])("%s", (_name, path, auth, env, status) => {
    expect(authorize(req(path, auth), env as NodeJS.ProcessEnv)?.status ?? null).toBe(status);
  });
});

it("merges a Plaid account into a CSV account", async () => {
  const csv = (await post("accounts", { name: "CSV Checking" })).id;
  await ctx.db.query("INSERT INTO accounts (name, source, source_id) VALUES ('Plaid Checking', 'plaid', 'acc1')");
  const pl = (await ctx.db.query<{ id: number }>("SELECT id FROM accounts WHERE source_id = 'acc1'"))[0].id;
  await post("transactions", { account_id: pl, date: "2026-10-01", amount: -3, payee: "X" });
  expect((await call("POST", `accounts/${pl}/merge`, { into_id: pl })).status).toBe(400);
  expect((await call("POST", `accounts/${pl}/merge`, { into_id: csv })).status).toBe(200);
  expect(await ctx.db.query("SELECT id, source, source_id FROM accounts")).toEqual([{ id: csv, source: "plaid", source_id: "acc1" }]);
  expect(await ctx.db.query("SELECT account_id FROM transactions")).toEqual([{ account_id: csv }]);
});
