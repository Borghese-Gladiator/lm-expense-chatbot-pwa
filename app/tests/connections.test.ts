import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { PlaidClient } from "@/server/plaid";

import { memoryDb } from "./helpers";
import { FakeBank } from "./support/fake-bank";

let bank: FakeBank;
let ctx: Ctx;

const settingsWith = (key: string) => ({
  ...loadSettings({} as NodeJS.ProcessEnv),
  plaidClientId: "cid",
  plaidSecret: "sec",
  appSecretKey: key,
});

beforeEach(async () => {
  bank = new FakeBank();
  const settings = settingsWith("k".repeat(32));
  ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings, bank.fetch, { retryDelayMs: 1 }) };
});
afterEach(() => ctx.db.close());

async function api(method: string, path: string, body?: unknown) {
  const res = await handle(
    ctx,
    new Request(`http://test/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    path.split("?")[0].split("/"),
  );
  return { status: res.status, data: await res.json() };
}

const count = async (table: string) => Number((await ctx.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);

describe("bank connections", () => {
  const connect = async () =>
    (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data.item as number;
  const names = async () => (await ctx.db.query<{ name: string }>("SELECT name FROM accounts ORDER BY name")).map((r) => r.name);

  it("disconnect keeps accounts and rows and unlinks the accounts", async () => {
    bank.add("a", 1, "A");
    const item = await connect();
    const before = await count("accounts");

    const out = await api("DELETE", `plaid/items/${item}`);
    expect(out).toMatchObject({ status: 200, data: { plaid_removed: true } });
    expect(await count("plaid_items")).toBe(0);
    expect(await count("accounts")).toBe(before);
    expect(await count("transactions")).toBe(1);
    expect(Number((await ctx.db.query<{ n: string }>("SELECT COUNT(*) AS n FROM accounts WHERE plaid_item_id IS NOT NULL"))[0].n)).toBe(0);
  });

  it("disconnect with data=delete removes the accounts and rows and keeps other accounts", async () => {
    bank.add("a", 1, "A");
    const item = await connect();
    await api("POST", "accounts", { name: "Cash", type: "cash" });

    expect((await api("DELETE", `plaid/items/${item}?data=delete`)).status).toBe(200);
    expect(await count("transactions")).toBe(0);
    expect(await names()).toEqual(["Cash"]);
  });

  it("disconnect still works locally when Plaid fails", async () => {
    bank.add("a", 1, "A");
    const item = await connect();
    bank.fail("/item/remove", 500, "INTERNAL_SERVER_ERROR", 99);
    expect((await api("DELETE", `plaid/items/${item}`)).data).toEqual({ plaid_removed: false });
    expect(await count("plaid_items")).toBe(0);
  });

  it("disconnect returns 404 for an unknown connection", async () => {
    expect((await api("DELETE", "plaid/items/999")).status).toBe(404);
  });

  it("sync-all syncs each healthy connection and skips a broken one", async () => {
    bank.add("a", 1, "A");
    const healthy = await connect();
    await ctx.db.query(
      "INSERT INTO plaid_items (item_id, institution, access_token_enc, status) SELECT 'broken', 'Broken', access_token_enc, 'reconnect' FROM plaid_items WHERE id = ?",
      [healthy],
    );
    bank.add("b", 2, "B");

    const out = await api("POST", "plaid/sync-all");
    expect(out.status).toBe(200);
    expect(out.data.items).toHaveLength(1);
    expect(out.data.items[0]).toMatchObject({ item: healthy, added: 1 });
  });

  it("rename changes the connection and its accounts, and survives a sync and a reconnect", async () => {
    bank.add("a", 1, "A");
    const item = await connect();
    expect((await api("PATCH", `plaid/items/${item}`, { name: "  My Chase  " })).status).toBe(200);
    bank.add("b", 2, "B");
    await api("POST", `plaid/items/${item}/sync`);
    await api("POST", `plaid/items/${item}/reconnected`);

    const items = (await api("GET", "plaid/items")).data;
    expect(items[0].institution).toBe("My Chase");
    expect((await ctx.db.query<{ institution: string }>("SELECT DISTINCT institution FROM accounts")).map((r) => r.institution)).toEqual(["My Chase"]);
  });

  it.each([[{ name: "" }], [{ name: "   " }], [{}]])("rename rejects %j", async (body) => {
    const item = await connect();
    expect((await api("PATCH", `plaid/items/${item}`, body)).status).toBe(422);
  });

  it("rename returns 404 for an unknown connection", async () => {
    expect((await api("PATCH", "plaid/items/999", { name: "X" })).status).toBe(404);
  });

  it("sync with an unreadable token gives a clear message and does not crash", async () => {
    bank.add("a", 1, "A");
    const item = await connect();
    ctx.settings.appSecretKey = "z".repeat(32);
    const out = await api("POST", `plaid/items/${item}/sync`);
    expect(out.status).toBe(502);
    expect(out.data.detail).toContain("TOKEN_UNREADABLE");
    expect(out.data.detail).toContain("connect the bank again");
  });
});
