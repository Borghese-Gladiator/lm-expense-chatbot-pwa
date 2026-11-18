import { afterEach, beforeEach, expect, it } from "vitest";

import { scalar, type Db } from "@/server/db";
import { suggestForTrip } from "@/server/suggest";

import { addAccount, addTxn, memoryDb } from "./helpers";

let db: Db;
let a: number;
let trip: number;
beforeEach(async () => {
  db = await memoryDb();
  a = await addAccount(db);
  trip = Number(await scalar(db, "INSERT INTO trips (name, start_date, end_date) VALUES ('T', '2026-10-10', '2026-10-15') RETURNING id"));
});
afterEach(() => db.close());

const ids = async () => (await suggestForTrip(db, trip))!.map((s) => s.id);

it("C1: includes the trip window and the pre-trip window, not outside them", async () => {
  const pre = await addTxn(db, a, "2026-10-01", -20, "Luggage Shop", "Shopping");
  const inside = await addTxn(db, a, "2026-10-12", -30, "Cafe", "Restaurants");
  const tooEarly = await addTxn(db, a, "2026-09-20", -20, "Old", "Shopping");
  const after = await addTxn(db, a, "2026-10-20", -20, "Later", "Shopping");
  const got = await ids();
  expect(got).toContain(pre);
  expect(got).toContain(inside);
  expect(got).not.toContain(tooEarly);
  expect(got).not.toContain(after);
});

it("C2: never includes a transfer category or a recurring charge", async () => {
  const ok = await addTxn(db, a, "2026-10-12", -30, "Cafe", "Restaurants");
  const transfer = await addTxn(db, a, "2026-10-12", -500, "Card Payment", "Credit Card Payment");
  const sub = await addTxn(db, a, "2026-10-12", -15.49, "Netflix", "Subscriptions");
  await addTxn(db, a, "2026-10-11", -9.99, "Gym", "Health");
  const gym = await addTxn(db, a, "2026-09-11", -9.99, "Gym", "Health");
  const gymNow = await addTxn(db, a, "2026-10-11", -9.99, "Gym", "Health");
  const got = await ids();
  expect(got).toContain(ok);
  for (const bad of [transfer, sub, gym, gymNow]) expect(got).not.toContain(bad);
});

it("C3: a travel category scores higher than the same transaction in another category", async () => {
  const travel = await addTxn(db, a, "2026-10-12", -200, "Vendor", "Travel");
  const other = await addTxn(db, a, "2026-10-12", -200, "Vendor2", "Shopping");
  const list = (await suggestForTrip(db, trip))!;
  const score = (id: number) => list.find((s) => s.id === id)!.score;
  expect(score(travel)).toBeGreaterThan(score(other));
});
