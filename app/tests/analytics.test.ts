import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnalyticsQuerySchema, drilldown, DrilldownSchema, runQuery, type DiffRow } from "@/server/analytics";
import { scalar, type Db, type Row } from "@/server/db";

import { seeded } from "./helpers";

const SEP = { start: "2026-09-01", end: "2026-09-30" };
const OCT = { start: "2026-10-01", end: "2026-10-31" };

let db: Db;
beforeAll(async () => {
  db = await seeded();
});
afterAll(() => db.close());

const q = (kw: object) => AnalyticsQuerySchema.parse(kw);
const rows = async (kw: object) => (await runQuery(db, q(kw))).rows as Row[];
const total = async (kw: object) => Number((await rows(kw))[0].value);

describe("totals", () => {
  it.each([
    // 80 + 120 - 20 refund + 60 + 40 split children; transfer, pending, split parent left out
    [{ filters: OCT }, 280],
    [{ filters: { ...OCT, include_pending: true } }, 320],
    [{ measure: "income", filters: OCT }, 3000],
    [{ measure: "net", filters: OCT }, 2720],
    [{ filters: SEP }, 80],
    [{ metric: "count", filters: OCT }, 5],
    [{ filters: { ...OCT, tags: ["date night"] } }, 120],
    [{ filters: { ...OCT, search: "whole" } }, 80],
    [{ filters: { ...OCT, amount_min: 100 } }, 120],
  ])("%j -> %d", async (kw, expected) => {
    expect(await total(kw)).toBeCloseTo(expected);
  });
});

it("excludes a one-off and recalculates", async () => {
  const big = await scalar<number>(db, "SELECT id FROM transactions WHERE amount = -120");
  expect(await total({ filters: { ...OCT, exclude_ids: [big] } })).toBeCloseTo(160);
});

it("excludes a category", async () => {
  const groceries = await scalar<number>(db, "SELECT id FROM categories WHERE name = 'Groceries'");
  expect(await total({ filters: { ...OCT, exclude_category_ids: [groceries] } })).toBeCloseTo(160);
});

it("groups by category", async () => {
  const out = await rows({ dimensions: ["category"], filters: OCT });
  expect(Object.fromEntries(out.map((r) => [r.d0, r.value]))).toEqual({ Groceries: 120, Restaurants: 100, Shopping: 60 });
  expect(out[0].d0).toBe("Groceries");
});

it("groups by tag and counts untagged", async () => {
  const out = await rows({ dimensions: ["tag"], filters: OCT });
  expect(Object.fromEntries(out.map((r) => [r.d0, r.value]))).toEqual({ "date night": 120, "(untagged)": 160 });
});

it("computes pct of total and cumulative", async () => {
  const pct = await rows({ dimensions: ["month", "category"], metric: "pct_of_total" });
  const octShare = pct.filter((r) => r.d0 === "2026-10-01").reduce((s, r) => s + Number(r.value), 0);
  expect(octShare).toBeCloseTo(100);
  const cum = await rows({ dimensions: ["month"], metric: "cumulative" });
  expect(cum.map((r) => r.value)).toEqual([80, 360]);
});

it("computes the median", async () => {
  expect(await total({ metric: "median", filters: OCT })).toBeCloseTo(60);
});

it("makes contributions sum to the change", async () => {
  const out = await runQuery(
    db,
    q({ dimensions: ["category"], filters: OCT, compare: "custom", compare_start: "2026-09-01", compare_end: "2026-09-30" }),
  );
  const totals = out.totals as DiffRow;
  const diffRows = out.rows as DiffRow[];
  expect([totals.current, totals.previous]).toEqual([280, 80]);
  expect(diffRows.reduce((s, r) => s + r.diff, 0)).toBeCloseTo(200);
  expect(diffRows.reduce((s, r) => s + (r.contribution ?? 0), 0)).toBeCloseTo(100);
  const shopping = diffRows.find((r) => r.d0 === "Shopping")!;
  expect([shopping.previous, shopping.pct]).toEqual([0, null]);
});

it.each([
  ["2026-10-01", "2026-10-10", "previous_period", ["2026-09-21", "2026-09-30"]],
  ["2026-10-01", "2026-10-31", "previous_period", ["2026-09-01", "2026-09-30"]],
  ["2026-03-01", "2026-03-31", "previous_period", ["2026-02-01", "2026-02-28"]],
  ["2026-01-01", "2026-03-31", "previous_period", ["2025-10-01", "2025-12-31"]],
  ["2024-02-29", "2024-02-29", "same_period_last_year", ["2023-02-28", "2023-02-28"]],
])("comparison range %s..%s %s", async (start, end, compare, expected) => {
  const out = await runQuery(db, q({ filters: { start, end }, compare }));
  const range = out.compare_range as { start: string; end: string };
  expect([range.start, range.end]).toEqual(expected);
});

it("drill-down matches the aggregate", async () => {
  const query = { dimensions: ["category", "month"], filters: OCT };
  const agg = new Map((await rows(query)).map((r) => [`${r.d0}|${r.d1}`, r.value]));
  const dd = await drilldown(db, DrilldownSchema.parse({ query, values: { category: "Restaurants", month: "2026-10-01" } }));
  expect(dd.total).toBe(agg.get("Restaurants|2026-10-01"));
  expect(dd.total).toBe(100);
  expect(dd.count).toBe(2);
});

it("drills down into untagged", async () => {
  const dd = await drilldown(
    db,
    DrilldownSchema.parse({ query: { dimensions: ["tag"], filters: OCT }, values: { tag: "(untagged)" } }),
  );
  expect(dd.total).toBe(160);
});

it.each([
  { metric: "cumulative", dimensions: ["category"] },
  { compare: "previous_period" },
  { compare: "previous_period", filters: OCT, dimensions: ["month"] },
  { dimensions: ["month", "month"] },
])("rejects invalid query %j", (kw) => {
  expect(AnalyticsQuerySchema.safeParse(kw).success).toBe(false);
});
