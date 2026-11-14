/**
 * Rules run on new CSV and Plaid rows. Conditions: payee or merchant text (case-insensitive),
 * account, and an amount range on the absolute amount. Rows with user_edited are never changed.
 * Rules run in id order, so a later rule wins over an earlier one.
 */
import { z } from "zod";

import { withHistory } from "./history";
import { one, type Db, type Row } from "./db";

export const RuleIn = z.object({
  name: z.string().trim().min(1).nullish(),
  text_contains: z.string().trim().min(1).nullish(),
  account_id: z.number().int().nullish(),
  amount_min: z.number().nullish(),
  amount_max: z.number().nullish(),
  set_category_id: z.number().int().nullish(),
  set_merchant: z.string().trim().min(1).nullish(),
  set_tags: z.array(z.string().trim().min(1)).default([]),
  set_reviewed: z.boolean().default(false),
});

const MATCH = `NOT t.user_edited
  AND (r.text_contains IS NULL OR strpos(
        lower(COALESCE(t.payee_raw, '') || ' ' || COALESCE(t.merchant, '')), lower(r.text_contains)) > 0)
  AND (r.account_id IS NULL OR t.account_id = r.account_id)
  AND (r.amount_min IS NULL OR abs(t.amount) >= r.amount_min)
  AND (r.amount_max IS NULL OR abs(t.amount) <= r.amount_max)`;

const SET = `category_id = COALESCE(r.set_category_id, t.category_id),
  merchant = COALESCE(r.set_merchant, t.merchant),
  tags = CASE WHEN cardinality(r.set_tags) > 0
         THEN ARRAY(SELECT DISTINCT x FROM unnest(t.tags || r.set_tags) x ORDER BY x) ELSE t.tags END,
  reviewed = t.reviewed OR r.set_reviewed,
  updated_at = now()`;

export async function createRule(db: Db, rule: z.input<typeof RuleIn>): Promise<number> {
  const r = RuleIn.parse(rule);
  const rows = await db.query<{ id: number }>(
    `INSERT INTO rules (name, text_contains, account_id, amount_min, amount_max, set_category_id, set_merchant, set_tags, set_reviewed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      r.name ?? null,
      r.text_contains ?? null,
      r.account_id ?? null,
      r.amount_min ?? null,
      r.amount_max ?? null,
      r.set_category_id ?? null,
      r.set_merchant ?? null,
      r.set_tags,
      r.set_reviewed,
    ],
  );
  return Number(rows[0].id);
}

export async function ruleName(db: Db, id: number): Promise<string> {
  const r = await one<{ name: string | null; text_contains: string | null }>(db, "SELECT name, text_contains FROM rules WHERE id = ?", [id]);
  return r?.name || r?.text_contains || `Rule #${id}`;
}

export async function applyRules(db: Db, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const rules = await db.query<{ id: number }>("SELECT id FROM rules ORDER BY id");
  for (const { id } of rules)
    await withHistory(db, ids, "Rule", await ruleName(db, id), async () => {
      await db.query(`UPDATE transactions t SET ${SET} FROM rules r WHERE r.id = ? AND t.id = ANY(?::bigint[]) AND ${MATCH}`, [id, ids]);
    });
}

export const previewRule = (db: Db, ruleId: number): Promise<Row[]> =>
  db.query(
    `SELECT t.id, t.date, t.amount, COALESCE(t.merchant, t.payee_raw) AS payee, c.name AS category
     FROM transactions t JOIN rules r ON r.id = ? LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${MATCH} ORDER BY t.date DESC, t.id`,
    [ruleId],
  );

export const applyRule = (db: Db, ruleId: number) =>
  db.tx(async (t) => {
    const old = await t.query(
      `SELECT t.id, t.category_id, t.merchant, t.tags, t.reviewed
       FROM transactions t JOIN rules r ON r.id = ? WHERE ${MATCH} ORDER BY t.id FOR UPDATE OF t`,
      [ruleId],
    );
    const exec = await one<{ id: number }>(
      t,
      "INSERT INTO rule_executions (rule_id, old_values) VALUES (?, ?) RETURNING id",
      [ruleId, JSON.stringify(old)],
    );
    const oldIds = old.map((o) => Number(o.id));
    await withHistory(t, oldIds, "Rule", await ruleName(t, ruleId), async () => {
      await t.query(`UPDATE transactions t SET ${SET} FROM rules r WHERE r.id = ? AND t.id = ANY(?::bigint[])`, [ruleId, oldIds]);
    });
    return { execution_id: Number(exec!.id), changed: old.length };
  });

export const undoExecution = (db: Db, execId: number) =>
  db.tx(async (t) => {
    const exec = await one<{ undone_at: string | null }>(t, "SELECT undone_at FROM rule_executions WHERE id = ? FOR UPDATE", [execId]);
    if (!exec) return null;
    if (exec.undone_at) return { restored: 0 };
    const rows = await t.query(
      `UPDATE transactions t SET category_id = o.category_id, merchant = o.merchant, tags = o.tags,
         reviewed = o.reviewed, updated_at = now()
       FROM rule_executions e,
            jsonb_to_recordset(e.old_values) AS o(id BIGINT, category_id BIGINT, merchant TEXT, tags TEXT[], reviewed BOOLEAN)
       WHERE e.id = ? AND t.id = o.id RETURNING t.id`,
      [execId],
    );
    await t.query("UPDATE rule_executions SET undone_at = now() WHERE id = ?", [execId]);
    return { restored: rows.length };
  });
