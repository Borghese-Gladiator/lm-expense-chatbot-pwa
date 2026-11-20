import { expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { categoryIdFor } from "@/server/db";
import { PlaidClient } from "@/server/plaid";
import { createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";

it("records manual, rule and undo changes in the history", async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  const ctx: Ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings) };
  const call = async (method: string, path: string, body?: unknown) =>
    (
      await handle(ctx, new Request(`http://t/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), path.split("/"))
    ).json();
  const db = ctx.db;
  const acct = await addAccount(db);
  const coffee = await categoryIdFor(db, "Coffee");
  const t = await addTxn(db, acct, "2026-10-01", -4, "Starbucks");

  expect(await call("GET", `transactions/${t}/history`)).toEqual([]);

  await call("PATCH", `transactions/${t}`, { notes: "latte" });
  await db.query("UPDATE transactions SET user_edited = FALSE WHERE id = ?", [t]);
  const rule = await createRule(db, { text_contains: "starbucks", set_category_id: coffee });
  const applied = await call("POST", `rules/${rule}/apply`, {});
  await call("POST", `rule-executions/${applied.execution_id}/undo`, {});

  const rows = await call("GET", `transactions/${t}/history`);
  expect(rows.map((r: { source: string; field: string }) => [r.source, r.field])).toEqual([
    ["undo", "category_id"],
    ["rule", "category_id"],
    ["manual", "notes"],
  ]);
  expect(rows[1]).toMatchObject({ rule_id: rule, old_value: null, new_value: coffee });
  expect(rows[2]).toMatchObject({ old_value: null, new_value: "latte" });

  await call("PATCH", `transactions/${t}`, { notes: "latte" });
  expect(await call("GET", `transactions/${t}/history`)).toHaveLength(3);
  await db.close();
});
