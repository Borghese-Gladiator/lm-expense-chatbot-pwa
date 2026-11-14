/** Per-transaction change history. Each changed field becomes one txn_history row. */
import type { Db } from "./db";

export type HistorySource = "Manual" | "Rule";
type Snap = Record<string, string>;

export async function snapshot(db: Db, ids: number[]): Promise<Map<number, Snap>> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT t.id, c.name AS category, t.merchant, array_to_string(t.tags, ', ') AS tags,
            t.notes, t.type, t.reviewed::text AS reviewed
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = ANY(?::bigint[])`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.id), Object.fromEntries(
    Object.entries(r).filter(([k]) => k !== "id").map(([k, v]) => [k, v == null ? "" : String(v)]),
  )]));
}

/** Run `change`, then log every field that differs between the before and after snapshots. */
export async function withHistory(
  db: Db, ids: number[], source: HistorySource, ruleName: string | null, change: () => Promise<void>,
): Promise<void> {
  if (!ids.length) return change();
  const before = await snapshot(db, ids);
  await change();
  const after = await snapshot(db, ids);
  for (const [tid, was] of before) {
    const now = after.get(tid);
    if (!now) continue;
    for (const field of Object.keys(was))
      if (was[field] !== now[field])
        await db.query(
          "INSERT INTO txn_history (transaction_id, field, old_value, new_value, source, rule_name) VALUES (?, ?, ?, ?, ?, ?)",
          [tid, field, was[field] || null, now[field] || null, source, ruleName],
        );
  }
}

export const listHistory = (db: Db, tid: number) =>
  db.query(
    "SELECT id, field, old_value, new_value, source, rule_name, created_at FROM txn_history WHERE transaction_id = ? ORDER BY created_at DESC, id DESC",
    [tid],
  );
