import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnalyticsQuerySchema, drilldown, DrilldownSchema, runQuery } from "@/server/analytics";
import { scalar, type Db, type Row } from "@/server/db";

import { addAccount, addTxn, memoryDb } from "./helpers";

let db: Db;
let rome: number;
let paris: number;
const ids: Record<string, number> = {};

const link = (trip: number, txn: string, amount: number | null = null) =>
  db.query("INSERT INTO trip_transactions (trip_id, transaction_id, amount) VALUES (?, ?, ?)", [trip, ids[txn], amount]);
const q = (kw: object) => AnalyticsQuerySchema.parse({ filters: { start: "2026-10-01", end: "2026-10-31" }, ...kw });
const byTrip = async (kw: object = {}): Promise<Record<string, number>> =>
  Object.fromEntries(((await runQuery(db, q({ dimensions: ["trip"], ...kw }))).rows as Row[]).map((r) => [String(r.d0), Number(r.value)]));

beforeEach(async () => {
  db = await memoryDb();
  const a = await addAccount(db);
  ids.hotel = await addTxn(db, a, "2026-10-02", -300, "Hotel", "Lodging");
  ids.food = await addTxn(db, a, "2026-10-03", -100, "Bistro", "Dining", { tags: ["date night"] });
  ids.flight = await addTxn(db, a, "2026-10-04", -500, "Airline", "Airfare");
  ids.home = await addTxn(db, a, "2026-10-05", -50, "Groceries", "Groceries");
  ids.card = await addTxn(db, a, "2026-10-06", -900, "Card payment", "Credit Card Payment", { type: "transfer" });
  rome = Number(await scalar(db, "INSERT INTO trips (name) VALUES ('Rome') RETURNING id"));
  paris = Number(await scalar(db, "INSERT INTO trips (name) VALUES ('Paris') RETURNING id"));
  await link(rome, "hotel");
  await link(rome, "food", 60);
  await link(paris, "flight");
});
afterEach(() => db.close());

describe("trip dimension", () => {
  it("groups spending by trip, counts a part link at its amount, and puts the rest under no trip", async () => {
    expect(await byTrip()).toEqual({ Rome: 360, Paris: 500, "(no trip)": 50 });
  });

  it("leaves a transfer out", async () => {
    expect(Object.values(await byTrip()).reduce((n, v) => n + v, 0)).toBe(910);
  });

  it("a transaction in two trips counts in each", async () => {
    await link(paris, "hotel");
    expect(await byTrip()).toMatchObject({ Rome: 360, Paris: 800 });
  });

  it("works with a second dimension", async () => {
    const out = (await runQuery(db, q({ dimensions: ["trip", "category"] }))).rows as Row[];
    expect(out.find((r) => r.d0 === "Rome" && r.d1 === "Dining")!.value).toBe(60);
    expect(out.find((r) => r.d0 === "(no trip)" && r.d1 === "Groceries")!.value).toBe(50);
  });

  it("works with the tag dimension", async () => {
    const out = (await runQuery(db, q({ dimensions: ["trip", "tag"] }))).rows as Row[];
    expect(out.find((r) => r.d0 === "Rome" && r.d1 === "date night")!.value).toBe(60);
  });

  it("supports count and compare to the previous period", async () => {
    expect((await runQuery(db, q({ dimensions: ["trip"], metric: "count" }))).rows as Row[]).toEqual(
      expect.arrayContaining([expect.objectContaining({ d0: "Rome", value: 2 })]),
    );
    const cmp = await runQuery(db, q({ dimensions: ["trip"], compare: "previous_period" }));
    expect((cmp.rows as Row[]).find((r) => r.d0 === "Paris")).toMatchObject({ current: 500, previous: 0 });
  });

  it("does not double count rows when no trip is used", async () => {
    await link(paris, "hotel");
    const plain = (await runQuery(db, q({ dimensions: [] }))).rows as Row[];
    expect(Number(plain[0].value)).toBe(950);
  });

  it("drills down into one trip and into the rows with no trip", async () => {
    const trip = await drilldown(db, DrilldownSchema.parse({ query: q({ dimensions: ["trip"] }), values: { trip: "Rome" } }));
    expect([trip.count, trip.total]).toEqual([2, 360]);
    const none = await drilldown(db, DrilldownSchema.parse({ query: q({ dimensions: ["trip"] }), values: { trip: "(no trip)" } }));
    expect([none.count, none.total]).toEqual([1, 50]);
  });
});

describe("trip filter", () => {
  it("keeps only the rows of the trip and combines with another dimension", async () => {
    const out = (await runQuery(db, q({ dimensions: ["category"], filters: { start: "2026-10-01", end: "2026-10-31", trip_id: rome } }))).rows as Row[];
    expect(Object.fromEntries(out.map((r) => [r.d0, Number(r.value)]))).toEqual({ Lodging: 300, Dining: 60 });
  });

  it("combines the trip filter with the trip dimension", async () => {
    expect(await byTrip({ filters: { start: "2026-10-01", end: "2026-10-31", trip_id: paris } })).toEqual({ Paris: 500 });
  });

  it("gives an empty result for a trip with no links", async () => {
    const empty = Number(await scalar(db, "INSERT INTO trips (name) VALUES ('Empty') RETURNING id"));
    expect((await runQuery(db, q({ dimensions: ["category"], filters: { start: "2026-10-01", end: "2026-10-31", trip_id: empty } }))).rows).toEqual([]);
  });

  it("drilldown without a trip dimension still reads from the plain view", async () => {
    const dd = await drilldown(db, DrilldownSchema.parse({ query: q({ dimensions: ["category"] }), values: { category: "Lodging" } }));
    expect([dd.count, dd.total]).toEqual([1, 300]);
  });
});
