import { beforeEach, expect, it } from "vitest";

import { BadRequest } from "@/server/analytics";
import { CsvImportSchema, importCsv } from "@/server/csv";
import { scalar, type Db } from "@/server/db";

import { memoryDb } from "./helpers";

const LUNCH_MONEY = `date,payee,amount,currency,category,category group,tags,notes,account,is_income
2026-10-01,Whole Foods,-54.20,usd,Groceries,Food,"home,weekly",,Chase Checking,false
2026-10-02,Coffee,-4.50,usd,Coffee,Food,,,Chase Checking,false
2026-10-02,Coffee,-4.50,usd,Coffee,Food,,,Chase Checking,false
2026-10-15,Employer,3000.00,usd,Paycheck,Income,,,Chase Checking,true
`;

const BANK = `Posted Date,Description,Debit,Credit
10/03/2026,NETFLIX,15.99,
10/04/2026,REFUND,,"$1,005.00"
bad,OOPS,1,
`;

let db: Db;
beforeEach(async () => {
  db = await memoryDb();
});

const run = (text: string, kw: object = {}) => importCsv(db, CsvImportSchema.parse({ csv_text: text, ...kw }), "USD");

it("imports the Lunch Money export and skips it the second time", async () => {
  const first = await run(LUNCH_MONEY);
  expect([first.added, first.skipped_duplicates, first.accounts_created]).toEqual([4, 0, ["Chase Checking"]]);
  const again = await run(LUNCH_MONEY);
  expect([again.added, again.skipped_duplicates]).toEqual([0, 4]);

  const txns = await db.query<{ category_group: string; tags: string[]; txn_type: string }>(
    "SELECT * FROM reportable ORDER BY date, id",
  );
  expect(txns.map((t) => t.category_group)).toEqual(["Food", "Food", "Food", "Income"]);
  expect(txns[0].tags).toEqual(["home", "weekly"]);
  expect(txns.at(-1)!.txn_type).toBe("income");
  expect(await scalar(db, "SELECT COUNT(*) FROM sync_runs WHERE source = 'csv'")).toBe(2);
});

it("reads bank debit and credit columns", async () => {
  const account = await scalar<number>(db, "INSERT INTO accounts (name) VALUES ('Visa') RETURNING id");
  const result = await run(BANK, { account_id: account });
  expect(result.added).toBe(2);
  expect(result.errors).toEqual(["line 4: cannot read date 'bad'"]);
  const amounts = await db.query<{ amount: number }>("SELECT amount FROM transactions ORDER BY date");
  expect(amounts.map((r) => r.amount)).toEqual([-15.99, 1005]);
});

it.each([
  ["payee,amount\nx,1\n", "no date column"],
  ["date,payee\n2026-01-01,x\n", "no amount"],
  ["date,amount\n2026-01-01,1\n", "choose an account"],
])("rejects an unusable file: %s", async (text, message) => {
  const err = await run(text).catch((e) => e);
  expect(err).toBeInstanceOf(BadRequest);
  expect(err.message).toContain(message);
});

it("flips the sign for positive_is_expense", async () => {
  const account = await scalar<number>(db, "INSERT INTO accounts (name) VALUES ('Amex') RETURNING id");
  await run("date,description,amount\n2026-10-01,Shop,25.00\n", { account_id: account, sign: "positive_is_expense" });
  expect(await scalar(db, "SELECT amount FROM transactions")).toBe(-25);
});
