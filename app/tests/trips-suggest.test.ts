import { expect, it } from "vitest";

import { suggestTrips } from "@/server/trips";

import { addAccount, addTxn, memoryDb } from "./helpers";

async function setup() {
  const db = await memoryDb();
  const a = await addAccount(db);
  for (const d of ["2026-08-03", "2026-08-10", "2026-08-17"]) await addTxn(db, a, d, -40, "Whole Foods", "Groceries");
  return { db, a };
}
const eur = async (db: any, id: number) => db.query("UPDATE transactions SET currency = 'EUR' WHERE id = ?", [id]);

it("suggests a trip covering travel/foreign-currency rows", async () => {
  const { db, a } = await setup();
  await eur(db, await addTxn(db, a, "2026-09-10", -80, "Cafe Roma", "Restaurants"));
  await addTxn(db, a, "2026-09-11", -300, "Hotel Roma", "Travel");
  await eur(db, await addTxn(db, a, "2026-09-13", -50, "Trattoria", "Restaurants"));
  const s = await suggestTrips(db);
  expect(s).toHaveLength(1);
  expect(s[0].start_date).toBe("2026-09-10");
  expect(s[0].end_date).toBe("2026-09-13");
  expect(s[0].transaction_ids).toHaveLength(3);
});

it("ignores transfers and recurring charges", async () => {
  const { db, a } = await setup();
  await addTxn(db, a, "2026-09-10", -900, "Wire", "Credit Card Payment");
  await addTxn(db, a, "2026-09-11", -500, "Bank", "Travel", { type: "transfer" });
  const ids = [] as number[];
  for (const d of ["2026-07-11", "2026-08-11", "2026-09-12"]) ids.push(await addTxn(db, a, d, -15, "Airline Club", "Travel"));
  expect(await suggestTrips(db)).toEqual([]);
});

it("scores pre-trip travel merchants but not home groceries", async () => {
  const { db, a } = await setup();
  const flight = await addTxn(db, a, "2026-09-01", -400, "Delta Air Lines", "Shopping");
  const groceries = await addTxn(db, a, "2026-09-05", -60, "Whole Foods", "Groceries");
  await addTxn(db, a, "2026-09-10", -300, "Hotel Roma", "Travel");
  const [t] = await suggestTrips(db);
  const byId = new Map(t.candidates.map((c) => [c.id, c]));
  expect(byId.get(flight)!.score).toBeGreaterThan(0);
  expect(byId.has(groceries)).toBe(false);
});
