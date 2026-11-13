import { categoryIdFor, openDb, scalar, type Db } from "@/server/db";

export const memoryDb = () => openDb({ databaseUrl: "", pgliteDir: "" }, true);

export const addAccount = async (db: Db, name = "Checking") =>
  Number(await scalar(db, "INSERT INTO accounts (name) VALUES (?) RETURNING id", [name]));

export async function addTxn(
  db: Db,
  account: number,
  day: string,
  amount: number,
  merchant: string,
  category: string | null = null,
  kw: { tags?: string[]; type?: string; pending?: boolean; parent?: number } = {},
): Promise<number> {
  const cat = category ? await categoryIdFor(db, category) : null;
  return Number(
    await scalar(
      db,
      `INSERT INTO transactions (source, account_id, date, amount, merchant, payee_raw,
         category_id, tags, type, is_pending, parent_id)
       VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [account, day, amount, merchant, merchant, cat, kw.tags ?? [], kw.type ?? null, kw.pending ?? false, kw.parent ?? null],
    ),
  );
}

export async function seeded(): Promise<Db> {
  const db = await memoryDb();
  const a = await addAccount(db);
  await addTxn(db, a, "2026-09-03", -50, "Whole Foods", "Groceries", { tags: ["home"] });
  await addTxn(db, a, "2026-09-10", -30, "Sushi Place", "Restaurants", { tags: ["date night"] });
  await addTxn(db, a, "2026-09-15", 3000, "Employer", "Paycheck");
  await addTxn(db, a, "2026-09-20", -500, "Card Payment", "Credit Card Payment");
  await addTxn(db, a, "2026-10-02", -80, "Whole Foods", "Groceries");
  await addTxn(db, a, "2026-10-05", -120, "Sushi Place", "Restaurants", { tags: ["date night"] });
  await addTxn(db, a, "2026-10-06", 20, "Sushi Place", "Restaurants");
  await addTxn(db, a, "2026-10-07", -40, "Pending Cafe", "Restaurants", { pending: true });
  const parent = await addTxn(db, a, "2026-10-12", -100, "Target", "Shopping");
  await addTxn(db, a, "2026-10-12", -60, "Target", "Shopping", { parent });
  await addTxn(db, a, "2026-10-12", -40, "Target", "Groceries", { parent });
  await addTxn(db, a, "2026-10-15", 3000, "Employer", "Paycheck");
  return db;
}
