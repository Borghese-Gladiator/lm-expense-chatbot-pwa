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
    path.split("/"),
  );
  return { status: res.status, data: await res.json() };
}

const count = async (table: string) => Number((await ctx.db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);

describe("bank connections", () => {
  it("remove deletes the connection, its accounts, and its rows, and keeps other accounts", async () => {
    bank.add("a", 1, "A");
    const { item } = (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
    await api("POST", "accounts", { name: "Cash", type: "cash" });

    const out = await api("DELETE", `plaid/items/${item}`);
    expect(out).toMatchObject({ status: 200, data: { plaid_removed: true } });
    expect(await count("plaid_items")).toBe(0);
    expect(await count("transactions")).toBe(0);
    expect((await ctx.db.query<{ name: string }>("SELECT name FROM accounts")).map((r) => r.name)).toEqual(["Cash"]);
  });

  it("remove still deletes locally when Plaid fails", async () => {
    bank.add("a", 1, "A");
    const { item } = (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
    bank.fail("/item/remove", 500, "INTERNAL_SERVER_ERROR", 99);
    expect((await api("DELETE", `plaid/items/${item}`)).data).toEqual({ plaid_removed: false });
    expect(await count("plaid_items")).toBe(0);
  });

  it("remove returns 404 for an unknown connection", async () => {
    expect((await api("DELETE", "plaid/items/999")).status).toBe(404);
  });

  it("rename saves the name and a later sync keeps it", async () => {
    bank.add("a", 1, "A");
    const { item } = (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
    expect((await api("PATCH", `plaid/items/${item}`, { institution: "  Everyday Bank " })).status).toBe(200);
    await api("POST", `plaid/items/${item}/sync`);
    const rows = await ctx.db.query<{ institution: string }>("SELECT institution FROM plaid_items");
    expect(rows.map((r) => r.institution)).toEqual(["Everyday Bank"]);
  });

  it.each([
    [999, { institution: "X" }, 404],
    [1, { institution: "   " }, 422],
  ])("rename of item %s with %j returns %s", async (item, body, status) => {
    expect((await api("PATCH", `plaid/items/${item}`, body)).status).toBe(status);
  });

  it("sync with an unreadable token gives a clear message and does not crash", async () => {
    bank.add("a", 1, "A");
    const { item } = (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
    ctx.settings.appSecretKey = "z".repeat(32);
    const out = await api("POST", `plaid/items/${item}/sync`);
    expect(out.status).toBe(502);
    expect(out.data.detail).toContain("TOKEN_UNREADABLE");
    expect(out.data.detail).toContain("connect the bank again");
  });
});
