import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handle, syncAll, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { PlaidClient } from "@/server/plaid";

import { memoryDb } from "./helpers";
import { FakeBank } from "./support/fake-bank";

let bank: FakeBank;
let ctx: Ctx;

beforeEach(async () => {
  bank = new FakeBank();
  const settings = {
    ...loadSettings({} as NodeJS.ProcessEnv),
    plaidClientId: "cid",
    plaidSecret: "sec",
    appSecretKey: "k".repeat(32),
  };
  ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings, bank.fetch, { retryDelayMs: 1 }) };
});
afterEach(() => ctx.db.close());

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await handle(
    ctx,
    new Request(`http://test/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    path.split("/"),
  );
  const text = await res.text();
  let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const connect = async () => (await api("POST", "plaid/exchange", { public_token: "pub", institution: "Bank" })).data;
const sync = (item: number) => api("POST", `plaid/items/${item}/sync`);
const search = async (filters: object = {}) => (await api("POST", "transactions/search", { filters, limit: 500 })).data;
const sourceIds = async () =>
  (await ctx.db.query<{ source_id: string }>("SELECT source_id FROM transactions WHERE source = 'plaid' ORDER BY source_id")).map((r) => r.source_id);
const rowOf = async (sourceId: string) =>
  (await ctx.db.query("SELECT r.*, t.source_id, t.user_edited FROM reportable r JOIN transactions t ON t.id = r.id WHERE t.source_id = ?", [sourceId]))[0];

describe("Plaid lifecycle", () => {
  it("connects, syncs pending then posted, edits, and removes", async () => {
    bank.add("pend-1", 5.25, "Starbucks", { pending: true });
    bank.add("t-2", 40, "Whole Foods");
    const first = await connect();
    expect(first).toMatchObject({ added: 2, modified: 0, removed: 0 });

    await api("PATCH", `transactions/${(await rowOf("pend-1")).id}`, { merchant: "My Coffee" });

    bank.post("pend-1", "post-1");
    bank.modify("t-2", { amount: 45 });
    expect(await sync(first.item)).toMatchObject({ status: 200, data: { added: 1, modified: 1, removed: 1 } });

    const posted = await rowOf("post-1");
    expect([posted.merchant, posted.is_pending, posted.amount]).toEqual(["My Coffee", false, -5.25]);
    expect((await rowOf("t-2")).amount).toBe(-45);
    expect(await sourceIds()).toEqual(["post-1", "t-2"]);

    bank.remove("t-2");
    await sync(first.item);
    expect(await sourceIds()).toEqual(["post-1"]);
    const runs = (await api("GET", "sync-runs")).data;
    expect(runs.map((r: any) => r.status)).toEqual(["ok", "ok", "ok"]); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("pages through more than one page of changes", async () => {
    bank.pageSize = 100;
    for (let i = 0; i < 250; i++) bank.add(`bulk-${i}`, 1 + i, `Shop ${i}`);
    const { added } = await connect();
    expect(added).toBe(250);
    expect((await search()).total).toBe(250);
  });

  it("is idempotent: a repeated sync adds nothing", async () => {
    bank.add("a", 1, "A");
    const { item } = await connect();
    expect((await sync(item)).data).toMatchObject({ added: 0, modified: 0, removed: 0 });
    expect((await search()).total).toBe(1);
  });

  it("retries a 500 and then succeeds", async () => {
    bank.add("a", 1, "A");
    bank.fail("/transactions/sync", 500, "INTERNAL_SERVER_ERROR", 2);
    expect((await connect()).added).toBe(1);
    expect(bank.callsTo("/transactions/sync").length).toBe(3);
  });

  it("returns 502 and keeps the data when Plaid keeps failing", async () => {
    bank.add("a", 1, "A");
    const { item } = await connect();
    bank.add("b", 2, "B");
    bank.fail("/transactions/sync", 500, "INTERNAL_SERVER_ERROR", 99);
    expect((await sync(item)).status).toBe(502);
    expect(await sourceIds()).toEqual(["a"]);
    bank.faults = [];
    expect((await sync(item)).data.added).toBe(1);
  });

  it("sets reconnect on login required, then skips it in the cron sync", async () => {
    bank.add("a", 1, "A");
    const { item } = await connect();
    bank.fail("/transactions/sync", 400, "ITEM_LOGIN_REQUIRED");
    expect((await sync(item)).status).toBe(502);
    const items = (await api("GET", "plaid/items")).data;
    expect(items[0].status).toBe("reconnect");

    const cron = await syncAll(ctx);
    expect(JSON.stringify(cron)).not.toContain("error");
    expect(bank.callsTo("/transactions/sync").length).toBe(2);

    const update = await api("POST", `plaid/items/${item}/link-token`);
    expect(update.status).toBe(200);
    expect(bank.callsTo("/link/token/create").at(-1)![1].access_token).toMatch(/^access-/);
    await api("POST", `plaid/items/${item}/reconnected`);
    expect(((await api("GET", "plaid/items")).data)[0].status).toBe("ok");
    expect((await sync(item)).status).toBe(200);
  });

  it("restarts a sync after a mutation during pagination", async () => {
    bank.pageSize = 1;
    bank.add("a", 1, "A");
    bank.add("b", 2, "B");
    bank.fail("/transactions/sync", 400, "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", 1, 1);
    expect((await connect()).added).toBe(2);
  });

  it("never returns the access token", async () => {
    bank.add("a", 1, "A");
    await connect();
    const body = JSON.stringify((await api("GET", "plaid/items")).data);
    expect(body).not.toMatch(/access-/);
    expect(body).not.toContain("access_token");
  });

  it("does not double-connect when a retry carries the same Idempotency-Key", async () => {
    bank.add("a", 1, "A");
    const h = { "Idempotency-Key": "k1" };
    const one = await api("POST", "plaid/exchange", { public_token: "p" }, h);
    const two = await api("POST", "plaid/exchange", { public_token: "p" }, h);
    expect(two.data).toEqual(one.data);
    expect(bank.callsTo("/item/public_token/exchange").length).toBe(1);
    expect((await api("GET", "plaid/items")).data.length).toBe(1);
  });
});

describe("Plaid and CSV together", () => {
  const CSV = "date,description,amount\n2026-09-01,Corner Grocery,-42.17\n2026-09-02,Cafe,-5";

  it("finds a possible duplicate, resolves it, and honors not-a-duplicate", async () => {
    bank.add("p-dup", 42.17, "CORNER GROCERY", { date: "2026-09-03" });
    const { item } = await connect();
    expect(item).toBeGreaterThan(0);
    const plaidAcct = (await api("GET", "meta")).data.accounts[0].id;
    expect((await api("POST", "import/csv", { csv_text: CSV, account_id: plaidAcct })).data.added).toBe(2);

    const dups = (await api("GET", "duplicates")).data;
    expect(dups).toHaveLength(1);
    expect(dups[0].amount).toBe(-42.17);

    const notDup = await api("POST", "duplicates/resolve", { keep: dups[0].plaid_id, remove: dups[0].csv_id, not_duplicate: true });
    expect(notDup.status).toBe(200);
    expect((await api("GET", "duplicates")).data).toEqual([]);
    expect((await search()).total).toBe(3);
  });

  it("removes the CSV row when the user keeps the bank row", async () => {
    bank.add("p-dup", 42.17, "CORNER GROCERY", { date: "2026-09-03" });
    await connect();
    const acct = (await api("GET", "meta")).data.accounts[0].id;
    await api("POST", "import/csv", { csv_text: CSV, account_id: acct });
    const [d] = (await api("GET", "duplicates")).data;
    await api("POST", "duplicates/resolve", { keep: d.plaid_id, remove: d.csv_id });
    expect((await search()).total).toBe(2);
    expect(await sourceIds()).toContain("p-dup");
  });

  it("skips bank rows before the history cutover", async () => {
    bank.add("old", 1, "Old", { date: "2026-05-01" });
    bank.add("new", 2, "New", { date: "2026-08-01" });
    const { item } = await connect();
    expect(item).toBeGreaterThan(0);
    const acct = (await api("GET", "meta")).data.accounts[0].id;
    await api("PATCH", `accounts/${acct}`, { history_cutover: "2026-06-01" });
    bank.add("old2", 3, "Old2", { date: "2026-05-15" });
    bank.add("new2", 4, "New2", { date: "2026-09-15" });
    await sync(item);
    expect(await sourceIds()).toEqual(["new", "new2", "old"]);
  });

  it("merges a Plaid account into a CSV account and keeps the sync working", async () => {
    const csvAcct = (await api("POST", "accounts", { name: "Checking (CSV)" })).data.id;
    await api("POST", "import/csv", { csv_text: CSV, account_id: csvAcct });
    bank.add("p1", 9, "Bank Row");
    const { item } = await connect();
    const plaidAcct = (await api("GET", "meta")).data.accounts.find((a: any) => a.source === "plaid").id; // eslint-disable-line @typescript-eslint/no-explicit-any

    expect((await api("POST", `accounts/${plaidAcct}/merge`, { into_id: csvAcct })).status).toBe(200);
    const accounts = (await api("GET", "meta")).data.accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].txn_count).toBe(3);

    bank.add("p2", 3, "Next Row");
    expect((await sync(item)).data.added).toBe(1);
    expect(((await api("GET", "meta")).data.accounts)[0].txn_count).toBe(4);
  });
});

describe("CSV import", () => {
  it("is idempotent for the same file and for the same Idempotency-Key", async () => {
    const acct = (await api("POST", "accounts", { name: "Cash" })).data.id;
    const csv = "date,description,amount\n2026-10-01,A,-1\n2026-10-01,A,-1\n2026-10-02,B,-2";
    expect((await api("POST", "import/csv", { csv_text: csv, account_id: acct })).data).toMatchObject({ added: 3, skipped_duplicates: 0 });
    expect((await api("POST", "import/csv", { csv_text: csv, account_id: acct })).data).toMatchObject({ added: 0, skipped_duplicates: 3 });
    const h = { "Idempotency-Key": "csv-1" };
    const one = await api("POST", "import/csv", { csv_text: "date,description,amount\n2026-11-01,C,-3", account_id: acct }, h);
    const two = await api("POST", "import/csv", { csv_text: "date,description,amount\n2026-11-01,C,-3", account_id: acct }, h);
    expect(two.data).toEqual(one.data);
    expect((await search()).total).toBe(4);
  });

  it("reports bad rows and rejects a file with no date column", async () => {
    const acct = (await api("POST", "accounts", { name: "Cash" })).data.id;
    const res = await api("POST", "import/csv", { csv_text: "date,description,amount\nnot-a-date,A,-1\n2026-10-02,B,-2", account_id: acct });
    expect(res.data.added).toBe(1);
    expect(res.data.errors).toHaveLength(1);
    expect((await api("POST", "import/csv", { csv_text: "foo,bar\n1,2", account_id: acct })).status).toBe(422);
  });
});

describe("Rules", () => {
  it("applies to new Plaid rows, skips edited rows, and undoes", async () => {
    const cat = (await api("POST", "categories", { name: "Coffee Rule", group_name: "Food" })).data.id;
    const rule = (await api("POST", "rules", { text_contains: "starbucks", set_category_id: cat, set_tags: ["rule"] })).data.id;

    bank.add("s1", 5, "Starbucks 1");
    const { item } = await connect();
    const s1 = await rowOf("s1");
    expect([s1.category, s1.tags]).toEqual(["Coffee Rule", ["rule"]]);

    await api("PATCH", `transactions/${s1.id}`, { clear_category: true });
    bank.add("s2", 6, "Starbucks 2");
    await sync(item);
    expect((await rowOf("s1")).category).toBe("Uncategorized");
    expect((await rowOf("s2")).category).toBe("Coffee Rule");

    const accts = (await api("GET", "meta")).data.accounts[0].id;
    await api("POST", "transactions", { account_id: accts, date: "2026-10-03", payee: "Starbucks manual", amount: -3 });
    const preview = (await api("POST", `rules/${rule}/preview`)).data;
    expect(preview.items.map((r: any) => r.payee)).toEqual(["Starbucks 2"]); // eslint-disable-line @typescript-eslint/no-explicit-any

    const csv = await api("POST", "import/csv", { csv_text: "date,description,amount\n2026-10-04,Starbucks csv,-4", account_id: accts });
    expect(csv.data.added).toBe(1);
    expect((await ctx.db.query("SELECT category FROM reportable WHERE payee_raw = 'Starbucks csv'"))[0].category).toBe("Coffee Rule");

    await ctx.db.query("UPDATE transactions SET category_id = NULL WHERE source_id = 's2'");
    const applied = (await api("POST", `rules/${rule}/apply`)).data;
    expect(applied.changed).toBe(2);
    expect((await rowOf("s2")).category).toBe("Coffee Rule");
    expect((await api("POST", `rule-executions/${applied.execution_id}/undo`)).data.restored).toBe(2);
    expect((await rowOf("s2")).category).toBe("Uncategorized");
    expect((await api("POST", `rule-executions/${applied.execution_id}/undo`)).data.restored).toBe(0);
    expect((await api("POST", "rule-executions/9999/undo")).status).toBe(404);
  });
});

describe("Transactions", () => {
  it("pages by cursor without gaps or repeats", async () => {
    const acct = (await api("POST", "accounts", { name: "Cash" })).data.id;
    const lines = Array.from({ length: 120 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, "0")},M${i},-${i + 1}`);
    await api("POST", "import/csv", { csv_text: `date,description,amount\n${lines.join("\n")}`, account_id: acct });
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: any = (await api("POST", "transactions/search", { limit: 25, cursor })).data; // eslint-disable-line @typescript-eslint/no-explicit-any
      seen.push(...page.items.map((t: any) => t.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect((await api("POST", "transactions/search", { cursor: "garbage" })).status).toBe(422);
  });

  it("refuses to delete a bank row", async () => {
    bank.add("a", 1, "A");
    await connect();
    const [row] = (await search()).items;
    expect((await api("DELETE", `transactions/${row.id}`)).status).toBe(409);
  });
});

describe("Report speed on 50,000 rows", () => {
  it("answers the main report queries in less than 2 seconds", async () => {
    const acct = (await api("POST", "accounts", { name: "Big" })).data.id;
    await ctx.db.query(
      `INSERT INTO transactions (source, source_id, account_id, date, amount, merchant, payee_raw)
       SELECT 'manual', 'big-' || g, ?, DATE '2024-01-01' + (g % 900), -((g % 200) + 1), 'Merchant ' || (g % 300), 'Merchant ' || (g % 300)
       FROM generate_series(1, 50000) g`,
      [acct],
    );
    const queries = [
      { dimensions: ["month"], filters: {} },
      { dimensions: ["category", "month"], filters: {} },
      { dimensions: ["merchant"], filters: {}, limit: 15 },
      { dimensions: ["month_of_year", "year"], filters: {}, chart: "line" },
    ];
    for (const q of queries) {
      const t0 = performance.now();
      const res = await api("POST", "analytics/query", q);
      expect(res.status).toBe(200);
      expect(performance.now() - t0).toBeLessThan(2000);
    }
    const t0 = performance.now();
    expect((await api("POST", "transactions/search", { limit: 50 })).status).toBe(200);
    expect(performance.now() - t0).toBeLessThan(2000);
  }, 60_000);
});
