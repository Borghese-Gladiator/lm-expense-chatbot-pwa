/**
 * Rules run on new CSV and Plaid rows. Conditions: payee or merchant text (case-insensitive),
 * account, and an amount range on the absolute amount. Rows with user_edited are never changed.
 * Rules run in id order, so a later rule wins over an earlier one.
 */
import { z } from "zod";

import type { Db } from "./db";

export const RuleIn = z.object({
  text_contains: z.string().trim().min(1).nullish(),
  account_id: z.number().int().nullish(),
  amount_min: z.number().nullish(),
  amount_max: z.number().nullish(),
  set_category_id: z.number().int().nullish(),
  set_merchant: z.string().trim().min(1).nullish(),
  set_tags: z.array(z.string().trim().min(1)).default([]),
  set_reviewed: z.boolean().default(false),
});

export async function createRule(db: Db, rule: z.input<typeof RuleIn>): Promise<number> {
  const r = RuleIn.parse(rule);
  const rows = await db.query<{ id: number }>(
    `INSERT INTO rules (text_contains, account_id, amount_min, amount_max, set_category_id, set_merchant, set_tags, set_reviewed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
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

export async function applyRules(db: Db, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const rules = await db.query<{ id: number }>("SELECT id FROM rules ORDER BY id");
  for (const { id } of rules)
    await db.query(
      `UPDATE transactions t SET
         category_id = COALESCE(r.set_category_id, t.category_id),
         merchant = COALESCE(r.set_merchant, t.merchant),
         tags = CASE WHEN cardinality(r.set_tags) > 0
                THEN ARRAY(SELECT DISTINCT x FROM unnest(t.tags || r.set_tags) x ORDER BY x) ELSE t.tags END,
         reviewed = t.reviewed OR r.set_reviewed,
         updated_at = now()
       FROM rules r
       WHERE r.id = ? AND t.id = ANY(?::bigint[]) AND NOT t.user_edited
         AND (r.text_contains IS NULL OR strpos(
               lower(COALESCE(t.payee_raw, '') || ' ' || COALESCE(t.merchant, '')), lower(r.text_contains)) > 0)
         AND (r.account_id IS NULL OR t.account_id = r.account_id)
         AND (r.amount_min IS NULL OR abs(t.amount) >= r.amount_min)
         AND (r.amount_max IS NULL OR abs(t.amount) <= r.amount_max)`,
      [id, ids],
    );
}
