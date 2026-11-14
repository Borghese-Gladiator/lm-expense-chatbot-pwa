import { expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { categoryIdFor } from "@/server/db";
import { PlaidClient } from "@/server/plaid";
import { createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";

it("previews, applies and undoes a rule on past rows", async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  const ctx: Ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings) };
  const post = async (path: string) =>
    (await handle(ctx, new Request(`http://t/api/${path}`, { method: "POST", body: "{}" }), path.split("/"))).json();
  const db = ctx.db;
  const acct = await addAccount(db);
  const coffee = await categoryIdFor(db, "Coffee");
  const a = await addTxn(db, acct, "2026-10-01", -4, "Starbucks", "Food");
  const b = await addTxn(db, acct, "2026-10-02", -5, "STARBUCKS 9");
  const edited = await addTxn(db, acct, "2026-10-03", -6, "Starbucks");
  await addTxn(db, acct, "2026-10-04", -7, "Peets");
  await db.query("UPDATE transactions SET user_edited = TRUE WHERE id = ?", [edited]);
  const rule = await createRule(db, { text_contains: "starbucks", set_category_id: coffee, set_reviewed: true });
  const snapshot = () => db.query("SELECT id, category_id, reviewed FROM transactions ORDER BY id");
  const before = await snapshot();

  const preview = await post(`rules/${rule}/preview`);
  expect(preview.count).toBe(2);
  expect(preview.items.map((r: { id: number }) => r.id).sort()).toEqual([a, b].sort());
  expect(await snapshot()).toEqual(before);

  const applied = await post(`rules/${rule}/apply`);
  expect(applied.changed).toBe(2);
  const after = await db.query<{ id: number; category_id: number | null }>("SELECT id, category_id FROM transactions ORDER BY id");
  expect(after.map((r) => r.category_id)).toEqual([coffee, coffee, null, null]);
  const execs = await db.query<{ old_values: { id: number }[] }>("SELECT old_values FROM rule_executions");
  expect(execs).toHaveLength(1);
  expect(execs[0].old_values.map((o) => Number(o.id)).sort()).toEqual([a, b].sort());

  expect((await post(`rule-executions/${applied.execution_id}/undo`)).restored).toBe(2);
  expect(await snapshot()).toEqual(before);
  await db.close();
});
