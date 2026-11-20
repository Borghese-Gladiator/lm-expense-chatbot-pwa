import type { Db } from "./db";

const FIELDS = ["category_id", "merchant", "tags", "notes", "type", "reviewed"] as const;

type Snapshot = Map<number, Record<string, unknown>>;

async function snapshot(db: Db, ids: number[]): Promise<Snapshot> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, ${FIELDS.join(", ")} FROM transactions WHERE id = ANY(?::bigint[])`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.id), r]));
}

export async function tracked<T>(
  db: Db,
  ids: number[],
  source: "manual" | "rule" | "undo",
  ruleId: number | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ids.length) return fn();
  const before = await snapshot(db, ids);
  const out = await fn();
  const after = await snapshot(db, ids);
  for (const [id, was] of before) {
    const now = after.get(id);
    if (!now) continue;
    for (const field of FIELDS) {
      const [oldValue, newValue] = [JSON.stringify(was[field] ?? null), JSON.stringify(now[field] ?? null)];
      if (oldValue === newValue) continue;
      await db.query(
        `INSERT INTO transaction_changes (transaction_id, source, rule_id, field, old_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, source, ruleId, field, oldValue, newValue],
      );
    }
  }
  return out;
}
