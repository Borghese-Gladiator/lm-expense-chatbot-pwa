import { afterEach, beforeEach, expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { PlaidClient } from "@/server/plaid";

import { memoryDb } from "./helpers";
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

const idOf = async (sourceId: string) =>
  Number((await ctx.db.query<{ id: number }>("SELECT id FROM transactions WHERE source_id = ?", [sourceId]))[0].id);
const links = async () =>
  ctx.db.query<{ source_id: string; amount: number | null }>(
    "SELECT t.source_id, l.amount FROM trip_transactions l JOIN transactions t ON t.id = l.transaction_id ORDER BY t.source_id",
  );

async function connectWithTrip() {
  bank.add("pend-1", 100, "Hotel", { pending: true });
  bank.add("keep-1", 40, "Taxi");
  bank.add("gone-1", 20, "Snack");
  const { item } = (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
  const trip = (await api("POST", "trips", { name: "Rome" })).data.id;
  for (const [sid, amount] of [["pend-1", 60], ["keep-1", null], ["gone-1", null]] as const)
    await api("POST", `trips/${trip}/transactions`, { transaction_id: await idOf(sid), amount });
  return item as number;
}

it("a pending row that posts keeps its trip link and its part amount", async () => {
  const item = await connectWithTrip();
  bank.post("pend-1", "post-1");
  await api("POST", `plaid/items/${item}/sync`);
  expect(await links()).toEqual([
    { source_id: "gone-1", amount: null },
    { source_id: "keep-1", amount: null },
    { source_id: "post-1", amount: 60 },
  ]);
});

it("a modified row keeps its trip link, and a removed row loses it", async () => {
  const item = await connectWithTrip();
  bank.modify("keep-1", { amount: 45 });
  bank.remove("gone-1");
  await api("POST", `plaid/items/${item}/sync`);
  expect((await links()).map((l) => l.source_id)).toEqual(["keep-1", "pend-1"]);
});

it("a second sync does not duplicate or lose the carried link", async () => {
  const item = await connectWithTrip();
  bank.post("pend-1", "post-1");
  await api("POST", `plaid/items/${item}/sync`);
  await api("POST", `plaid/items/${item}/sync`);
  expect((await links()).map((l) => l.source_id)).toEqual(["gone-1", "keep-1", "post-1"]);
});
