import { expect, it } from "vitest";

import { importCsv } from "@/server/csv";
import { categoryIdFor, one } from "@/server/db";
import { applyRules, createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";

it("sets the category on a new CSV row and skips rows the user edited", async () => {
  const db = await memoryDb();
  const acct = await addAccount(db);
  const coffee = await categoryIdFor(db, "Coffee");
  await createRule(db, { text_contains: "starbucks", set_category_id: coffee, set_tags: ["caf"], set_reviewed: true });
  await importCsv(
    db,
    { csv_text: "date,payee,amount\n2026-10-01,STARBUCKS #123,-4.50\n", account_id: acct, sign: "negative_is_expense" },
    "USD",
  );
  expect(await one(db, "SELECT category_id, tags, reviewed FROM transactions WHERE payee_raw = 'STARBUCKS #123'")).toEqual({
    category_id: coffee,
    tags: ["caf"],
    reviewed: true,
  });

  const edited = await addTxn(db, acct, "2026-10-02", -5, "Starbucks");
  await db.query("UPDATE transactions SET user_edited = TRUE WHERE id = ?", [edited]);
  await applyRules(db, [edited]);
  expect((await one(db, "SELECT category_id FROM transactions WHERE id = ?", [edited]))!.category_id).toBeNull();
});

it("matches on account and amount range", async () => {
  const db = await memoryDb();
  const a = await addAccount(db, "A");
  const b = await addAccount(db, "B");
  const cat = await categoryIdFor(db, "Mid");
  await createRule(db, { account_id: a, amount_min: 10, amount_max: 50, set_category_id: cat });
  const ids = [await addTxn(db, a, "2026-10-01", -25, "x"), await addTxn(db, a, "2026-10-01", -60, "x"), await addTxn(db, b, "2026-10-01", -25, "x")];
  await applyRules(db, ids);
  const rows = await db.query<{ category_id: number | null }>("SELECT category_id FROM transactions ORDER BY id");
  expect(rows.map((r) => r.category_id)).toEqual([cat, null, null]);
});
