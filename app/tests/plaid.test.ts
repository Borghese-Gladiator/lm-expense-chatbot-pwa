import { beforeEach, expect, it } from "vitest";

import { loadSettings } from "@/server/config";
import { scalar, type Db } from "@/server/db";
import * as plaid from "@/server/plaid";

import { memoryDb } from "./helpers";

const SETTINGS = {
  ...loadSettings({} as NodeJS.ProcessEnv),
  plaidClientId: "cid",
  plaidSecret: "sec",
  appSecretKey: "x".repeat(32),
};
const ACCOUNT = {
  account_id: "acc1",
  name: "Plaid Checking",
  subtype: "checking",
  balances: { current: 1000, iso_currency_code: "USD" },
};

const txn = (tid: string, amount: number, name = "Starbucks", pending = false, pendingId: string | null = null) => ({
  transaction_id: tid,
  account_id: "acc1",
  date: "2026-10-01",
  amount,
  name,
  merchant_name: name,
  pending,
  pending_transaction_id: pendingId,
  iso_currency_code: "USD",
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
});

type Page = Record<string, unknown> | number;

class FakePlaid {
  calls: [string, Record<string, unknown>][] = [];
  errorCode = "ITEM_LOGIN_REQUIRED";
  constructor(public pages: Page[]) {}

  fetch: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body));
    this.calls.push([path, body]);
    if (path === "/item/public_token/exchange") return Response.json({ access_token: "access-secret", item_id: "item1" });
    if (path === "/accounts/get") return Response.json({ accounts: [ACCOUNT] });
    if (path === "/transactions/sync") {
      const page = this.pages.shift()!;
      if (typeof page === "number")
        return Response.json({ error_code: this.errorCode, error_message: "x" }, { status: page });
      return Response.json({ accounts: [ACCOUNT], removed: [], modified: [], ...page });
    }
    return new Response(null, { status: 404 });
  };
}

let db: Db;
beforeEach(async () => {
  db = await memoryDb();
});

async function connect(fake: FakePlaid) {
  const client = new plaid.PlaidClient(SETTINGS, fake.fetch);
  return [client, await plaid.exchangePublicToken(db, client, "public", "Bank")] as const;
}

it("runs the full sync lifecycle", async () => {
  const fake = new FakePlaid([
    { added: [txn("p1", 5.25, "Starbucks", true)], next_cursor: "c1", has_more: true },
    { added: [txn("t2", -100, "Refund")], next_cursor: "c2", has_more: false },
  ]);
  const [client, item] = await connect(fake);
  expect(await plaid.syncItem(db, client, item)).toEqual({ added: 2, modified: 0, removed: 0 });
  expect(await scalar(db, "SELECT cursor FROM plaid_items")).toBe("c2");
  expect(await scalar(db, "SELECT access_token_enc FROM plaid_items")).not.toContain("access-secret");

  const [p1] = await db.query("SELECT * FROM reportable WHERE payee_raw = 'Starbucks'");
  expect([p1.amount, p1.is_pending, p1.category, p1.category_group]).toEqual([-5.25, true, "Coffee", "Food And Drink"]);

  await db.query("UPDATE transactions SET merchant = 'My Coffee', user_edited = TRUE WHERE source_id = 'p1'");
  fake.pages = [
    {
      added: [txn("t1", 5.25, "Starbucks", false, "p1")],
      modified: [txn("t2", -90, "Refund")],
      removed: [{ transaction_id: "p1" }],
      next_cursor: "c3",
      has_more: false,
    },
  ];
  expect(await plaid.syncItem(db, client, item)).toEqual({ added: 1, modified: 1, removed: 1 });
  const [posted] = await db.query("SELECT * FROM transactions WHERE source_id = 't1'");
  expect([posted.merchant, posted.is_pending, posted.user_edited]).toEqual(["My Coffee", false, true]);
  expect(await scalar(db, "SELECT amount FROM transactions WHERE source_id = 't2'")).toBe(90);
  expect(await scalar(db, "SELECT COUNT(*) FROM transactions WHERE source_id = 'p1'")).toBe(0);
  expect(fake.calls.at(-1)![1].cursor).toBe("c2");
});

it("marks reconnect on a failed sync and keeps the data", async () => {
  const fake = new FakePlaid([{ added: [txn("t1", 5)], next_cursor: "c1", has_more: false }, 400]);
  const [client, item] = await connect(fake);
  await plaid.syncItem(db, client, item);
  await expect(plaid.syncItem(db, client, item)).rejects.toBeInstanceOf(plaid.PlaidError);
  expect(await scalar(db, "SELECT status FROM plaid_items")).toBe("reconnect");
  expect(await scalar(db, "SELECT cursor FROM plaid_items")).toBe("c1");
  expect(await scalar(db, "SELECT COUNT(*) FROM transactions")).toBe(1);
  expect((await db.query("SELECT status FROM sync_runs ORDER BY id")).map((r) => r.status)).toEqual(["ok", "error"]);
});

it("restarts after a mutation during pagination", async () => {
  const fake = new FakePlaid([
    { added: [txn("t1", 5)], next_cursor: "c1", has_more: true },
    400,
    { added: [txn("t1", 5)], next_cursor: "c9", has_more: false },
  ]);
  fake.errorCode = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
  const [client, item] = await connect(fake);
  expect((await plaid.syncItem(db, client, item)).added).toBe(1);
  expect(await scalar(db, "SELECT cursor FROM plaid_items")).toBe("c9");
});
