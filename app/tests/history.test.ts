import { expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { categoryIdFor } from "@/server/db";
import { PlaidClient } from "@/server/plaid";
import { createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";

it("logs manual edits and rule changes", async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  const ctx: Ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings) };
  const call = async (method: string, path: string, body?: unknown) =>
    (await handle(ctx, new Request(`http://t/api/${path}`, { method, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) }), path.split("/"))).json();
  const db = ctx.db;
  const acct = await addAccount(db);
  const t = await addTxn(db, acct, "2026-10-01", -4, "Starbucks", "Food");
  const u = await addTxn(db, acct, "2026-10-02", -4, "Starbucks");
  const dining = await categoryIdFor(db, "Dining");
  await call("PATCH", `transactions/${t}`, { category_id: dining });
  let d = await call("GET", `transactions/${t}`);
  expect(d.history).toHaveLength(1);
  expect(d.history[0]).toMatchObject({ field: "category", old_value: "Food", new_value: "Dining", source: "Manual" });

  const coffee = await categoryIdFor(db, "Coffee");
  const rule = await createRule(db, { name: "Coffee rule", text_contains: "starbucks", set_category_id: coffee });
  await call("POST", `rules/${rule}/apply`);
  d = await call("GET", `transactions/${u}`);
  expect(d.history[0]).toMatchObject({ field: "category", old_value: null, new_value: "Coffee", source: "Rule", rule_name: "Coffee rule" });
  await db.close();
});
