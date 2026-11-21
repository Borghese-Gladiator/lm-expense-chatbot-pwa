import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { categoryIdFor } from "@/server/db";
import { PlaidClient } from "@/server/plaid";
import { applyRules, createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";
import { FakeBank } from "./support/fake-bank";

let bank: FakeBank;
let ctx: Ctx;

beforeEach(async () => {
  bank = new FakeBank();
  const settings = { ...loadSettings({} as NodeJS.ProcessEnv), plaidClientId: "cid", plaidSecret: "sec", appSecretKey: "k".repeat(32) };
  ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings, bank.fetch, { retryDelayMs: 1 }) };
});
afterEach(() => ctx.db.close());

async function api(method: string, path: string, body?: unknown) {
  const res = await handle(
    ctx,
    new Request(`http://t/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    path.split("?")[0].split("/"),
  );
  return { status: res.status, data: await res.json() };
}

const totals = async () => {
  const { total, sum } = (await api("POST", "transactions/search", { filters: { include_pending: true }, limit: 100 })).data as { total: number; sum: number };
  return { total, sum };
};
const groceries = () => categoryIdFor(ctx.db, "Groceries");
const household = () => categoryIdFor(ctx.db, "Household");

async function splitStore() {
  const acct = await addAccount(ctx.db);
  const parent = await addTxn(ctx.db, acct, "2026-10-01", -120, "Store");
  const parts = [
    { amount: -80, category_id: await groceries() },
    { amount: -40, category_id: await household() },
  ];
  return { acct, parent, parts };
}

describe("split a transaction", () => {
  it("creates parts that copy the date and account, and reports count the parts and not the parent", async () => {
    const { parent, parts } = await splitStore();
    const out = await api("PUT", `transactions/${parent}/split`, { parts });
    expect(out.status).toBe(200);
    expect(out.data.ids).toHaveLength(2);

    expect(await totals()).toEqual({ total: 2, sum: -120 });
    const rows = await ctx.db.query<{ amount: number; parent_id: number; date: string }>(
      "SELECT amount, parent_id, date::text AS date FROM transactions WHERE parent_id IS NOT NULL ORDER BY id",
    );
    expect(rows.map((r) => [r.amount, r.parent_id, r.date])).toEqual([[-80, parent, "2026-10-01"], [-40, parent, "2026-10-01"]]);
  });

  it("the detail of the parent lists its parts", async () => {
    const { parent, parts } = await splitStore();
    await api("PUT", `transactions/${parent}/split`, { parts });
    expect((await api("GET", `transactions/${parent}`)).data.children).toHaveLength(2);
  });

  it.each([
    { name: "the parts do not add up", parts: [{ amount: -80 }, { amount: -30 }] },
    { name: "there is one part", parts: [{ amount: -120 }] },
    { name: "a part is zero", parts: [{ amount: -120 }, { amount: 0 }] },
    { name: "the parts have the wrong sign", parts: [{ amount: 80 }, { amount: 40 }] },
  ])("returns 422 and changes nothing when $name", async ({ parts }) => {
    const { parent } = await splitStore();
    expect((await api("PUT", `transactions/${parent}/split`, { parts })).status).toBe(422);
    expect(await totals()).toEqual({ total: 1, sum: -120 });
  });

  it("allows a part with the opposite sign when the parts still add up", async () => {
    const { parent } = await splitStore();
    expect((await api("PUT", `transactions/${parent}/split`, { parts: [{ amount: -150 }, { amount: 30 }] })).status).toBe(200);
    expect(await totals()).toEqual({ total: 2, sum: -120 });
  });

  it("names the difference when the sum is wrong", async () => {
    const { parent } = await splitStore();
    const out = await api("PUT", `transactions/${parent}/split`, { parts: [{ amount: -80 }, { amount: -30 }] });
    expect(out.data.detail).toContain("add up to -110");
  });

  it("adds cents without a rounding error", async () => {
    const acct = await addAccount(ctx.db);
    const parent = await addTxn(ctx.db, acct, "2026-10-01", -0.3, "Tiny");
    expect((await api("PUT", `transactions/${parent}/split`, { parts: [{ amount: -0.1 }, { amount: -0.2 }] })).status).toBe(200);
  });

  it("replaces an earlier split", async () => {
    const { parent, parts } = await splitStore();
    await api("PUT", `transactions/${parent}/split`, { parts });
    await api("PUT", `transactions/${parent}/split`, { parts: [{ amount: -60 }, { amount: -30 }, { amount: -30 }] });
    expect(await totals()).toEqual({ total: 3, sum: -120 });
  });

  it("removing the split makes the parent count again", async () => {
    const { parent, parts } = await splitStore();
    await api("PUT", `transactions/${parent}/split`, { parts });
    expect((await api("DELETE", `transactions/${parent}/split`)).data).toEqual({ removed: 2 });
    expect(await totals()).toEqual({ total: 1, sum: -120 });
  });

  it("a part cannot be split again or deleted alone, and a missing parent gives 404", async () => {
    const { parent, parts } = await splitStore();
    const [child] = (await api("PUT", `transactions/${parent}/split`, { parts })).data.ids;
    expect((await api("PUT", `transactions/${child}/split`, { parts: [{ amount: -50 }, { amount: -30 }] })).status).toBe(409);
    expect((await api("DELETE", `transactions/${child}`)).status).toBe(409);
    expect((await api("PUT", "transactions/9999/split", { parts })).status).toBe(404);
  });

  it("deleting the parent deletes its parts", async () => {
    const { parent, parts } = await splitStore();
    await api("PUT", `transactions/${parent}/split`, { parts });
    await api("DELETE", `transactions/${parent}`);
    expect(Number((await ctx.db.query<{ n: string }>("SELECT COUNT(*) AS n FROM transactions"))[0].n)).toBe(0);
  });

  it("a transaction that is linked to a trip cannot be split", async () => {
    const { parent, parts } = await splitStore();
    const trip = (await api("POST", "trips", { name: "Rome" })).data.id;
    await api("POST", `trips/${trip}/transactions`, { transaction_id: parent });
    expect((await api("PUT", `transactions/${parent}/split`, { parts })).status).toBe(409);
  });

  it("a rule skips a split parent and still applies to a part", async () => {
    const { parent, parts } = await splitStore();
    const [first] = (await api("PUT", `transactions/${parent}/split`, { parts })).data.ids;
    const dining = await categoryIdFor(ctx.db, "Dining");
    await createRule(ctx.db, { text_contains: "store", set_category_id: dining });
    await ctx.db.query("UPDATE transactions SET user_edited = FALSE");
    await applyRules(ctx.db, [parent, first]);
    const rows = await ctx.db.query<{ id: number; category_id: number | null }>("SELECT id, category_id FROM transactions WHERE id IN (?, ?) ORDER BY id", [parent, first]);
    expect(rows.find((r) => r.id === parent)!.category_id).toBeNull();
    expect(rows.find((r) => r.id === first)!.category_id).toBe(dining);
  });
});

describe("a split and a bank sync", () => {
  const connect = async () => (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data.item as number;
  const sync = (item: number) => api("POST", `plaid/items/${item}/sync`);
  const idOf = async (sid: string) => Number((await ctx.db.query<{ id: number }>("SELECT id FROM transactions WHERE source_id = ?", [sid]))[0].id);
  const parts = [{ amount: -60 }, { amount: -40 }];
  const count = async () => Number((await ctx.db.query<{ n: string }>("SELECT COUNT(*) AS n FROM transactions WHERE parent_id IS NOT NULL"))[0].n);

  it("a pending row that posts with the same amount keeps its split", async () => {
    bank.add("pend", 100, "Store", { pending: true });
    const item = await connect();
    await api("PUT", `transactions/${await idOf("pend")}/split`, { parts });

    bank.post("pend", "post");
    await sync(item);
    const post = await idOf("post");
    expect((await ctx.db.query<{ parent_id: number }>("SELECT parent_id FROM transactions WHERE parent_id IS NOT NULL")).map((r) => Number(r.parent_id))).toEqual([post, post]);
    expect(await totals()).toEqual({ total: 2, sum: -100 });
  });

  it("a pending row that posts with a different amount loses its split", async () => {
    bank.add("pend", 100, "Store", { pending: true });
    const item = await connect();
    await api("PUT", `transactions/${await idOf("pend")}/split`, { parts });

    bank.post("pend", "post", { amount: 112 });
    await sync(item);
    expect(await count()).toBe(0);
    expect(await totals()).toEqual({ total: 1, sum: -112 });
  });

  it("a modified amount removes the split and marks the row unreviewed", async () => {
    bank.add("t1", 100, "Store");
    const item = await connect();
    const parent = await idOf("t1");
    await ctx.db.query("UPDATE transactions SET reviewed = TRUE WHERE id = ?", [parent]);
    await api("PUT", `transactions/${parent}/split`, { parts });

    bank.modify("t1", { amount: 105 });
    await sync(item);
    expect(await count()).toBe(0);
    expect((await ctx.db.query<{ reviewed: boolean }>("SELECT reviewed FROM transactions WHERE id = ?", [parent]))[0].reviewed).toBe(false);
    expect(await totals()).toEqual({ total: 1, sum: -105 });
  });

  it("a modified date moves the parts, and the same amount keeps the split", async () => {
    bank.add("t1", 100, "Store", { date: "2026-10-01" });
    const item = await connect();
    await api("PUT", `transactions/${await idOf("t1")}/split`, { parts });

    bank.modify("t1", { date: "2026-10-03" });
    await sync(item);
    expect((await ctx.db.query<{ d: string }>("SELECT DISTINCT date::text AS d FROM transactions WHERE parent_id IS NOT NULL")).map((r) => r.d)).toEqual(["2026-10-03"]);
  });

  it("a removed row takes its parts with it", async () => {
    bank.add("t1", 100, "Store");
    const item = await connect();
    await api("PUT", `transactions/${await idOf("t1")}/split`, { parts });

    bank.remove("t1");
    await sync(item);
    expect(Number((await ctx.db.query<{ n: string }>("SELECT COUNT(*) AS n FROM transactions"))[0].n)).toBe(0);
  });
});
