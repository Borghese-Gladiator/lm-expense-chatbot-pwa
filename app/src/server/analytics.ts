/**
 * Structured analytics query -> parameterized SQL over the `reportable` view.
 *
 * Semantics (PRD section 8):
 * - amount < 0 is money out. `spending` flips the sign, so a refund (positive expense) reduces it.
 * - Transfers and adjustments never count toward spending, income or net.
 * - Pending rows and categories flagged exclude_from_totals are left out unless asked.
 * - `reportable` only holds leaf rows, so a split parent never counts next to its children.
 */
import { z } from "zod";

import type { Db, Row } from "./db";

const TIME = ["day", "week", "month", "quarter", "year"] as const;
const DIMENSIONS = [
  ...TIME,
  "category",
  "category_group",
  "merchant",
  "account",
  "tag",
  "type",
  "day_of_week",
  "month_of_year",
  "weekend",
] as const;
type Dimension = (typeof DIMENSIONS)[number];
type Measure = "spending" | "income" | "net";
const TIME_DIMS = new Set<string>(TIME);

export const DIM_SQL: Record<Dimension, string> = {
  day: "date",
  week: "CAST(date_trunc('week', date) AS DATE)",
  month: "CAST(date_trunc('month', date) AS DATE)",
  quarter: "CAST(date_trunc('quarter', date) AS DATE)",
  year: "CAST(date_trunc('year', date) AS DATE)",
  category: "category",
  category_group: "category_group",
  merchant: "merchant",
  account: "account",
  tag: "tag",
  type: "txn_type",
  day_of_week: "to_char(date, 'ID Dy')",
  month_of_year: "CAST(extract(month FROM date) AS INT)",
  weekend: "CASE WHEN extract(isodow FROM date) IN (6, 7) THEN 'Weekend' ELSE 'Weekday' END",
};

const MEASURES: Record<Measure, [string[], string]> = {
  spending: [["expense"], "-amount"],
  income: [["income"], "amount"],
  net: [["income", "expense"], "amount"],
};

const isoDate = z.iso.date();
const ids = z.array(z.number().int()).default([]);
const strs = z.array(z.string()).default([]);

export const FiltersSchema = z.object({
  start: isoDate.nullish(),
  end: isoDate.nullish(),
  account_ids: ids,
  category_ids: ids,
  category_groups: strs,
  merchants: strs,
  tags: strs,
  types: strs,
  amount_min: z.number().nullish(),
  amount_max: z.number().nullish(),
  search: z.string().nullish(),
  include_pending: z.boolean().default(false),
  include_excluded_categories: z.boolean().default(false),
  exclude_ids: ids,
});
export type Filters = z.infer<typeof FiltersSchema>;

export const AnalyticsQuerySchema = z
  .object({
    measure: z.enum(["spending", "income", "net"]).default("spending"),
    metric: z.enum(["total", "count", "avg", "median", "pct_of_total", "cumulative"]).default("total"),
    dimensions: z.array(z.enum(DIMENSIONS)).max(2).default([]),
    filters: FiltersSchema.prefault({}),
    compare: z.enum(["none", "previous_period", "same_period_last_year", "custom"]).default("none"),
    compare_start: isoDate.nullish(),
    compare_end: isoDate.nullish(),
    sort: z.enum(["value_desc", "value_asc", "dimension"]).default("value_desc"),
    limit: z.number().int().min(1).max(5000).default(100),
    chart: z.enum(["auto", "bar", "line", "area", "stacked_bar", "treemap", "table"]).default("auto"),
  })
  .superRefine((q, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(q.dimensions).size !== q.dimensions.length) fail("dimensions must be different");
    if (q.metric === "cumulative" && !(q.dimensions.length && TIME_DIMS.has(q.dimensions[0])))
      fail("cumulative needs a time dimension first");
    if (q.compare !== "none") {
      if (!q.filters.start || !q.filters.end) fail("compare needs filters.start and filters.end");
      if (q.dimensions.some((d) => TIME_DIMS.has(d))) fail("compare does not support time dimensions");
      if (q.metric === "pct_of_total" || q.metric === "cumulative")
        fail("compare supports total, count, avg and median");
      if (q.compare === "custom" && (!q.compare_start || !q.compare_end))
        fail("custom compare needs compare_start and compare_end");
    }
  });
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export function whereClause(f: Filters, measure: Measure | null): [string, unknown[]] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const anyOf = (column: string, values: unknown[]) => {
    clauses.push(`${column} IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  };

  if (measure !== null) {
    anyOf("txn_type", MEASURES[measure][0]);
    if (!f.include_excluded_categories) clauses.push("NOT category_excluded");
  }
  if (!f.include_pending) clauses.push("NOT is_pending");
  if (f.start) {
    clauses.push("date >= ?");
    params.push(f.start);
  }
  if (f.end) {
    clauses.push("date <= ?");
    params.push(f.end);
  }
  if (f.account_ids.length) anyOf("account_id", f.account_ids);
  if (f.category_ids.length) anyOf("category_id", f.category_ids);
  if (f.category_groups.length) anyOf("category_group", f.category_groups);
  if (f.merchants.length) anyOf("merchant", f.merchants);
  if (f.types.length) anyOf("txn_type", f.types);
  if (f.tags.length) {
    clauses.push("tags && ?::text[]");
    params.push(f.tags);
  }
  if (f.amount_min != null) {
    clauses.push("abs(amount) >= ?");
    params.push(f.amount_min);
  }
  if (f.amount_max != null) {
    clauses.push("abs(amount) <= ?");
    params.push(f.amount_max);
  }
  if (f.search) {
    clauses.push("(payee_raw ILIKE ? OR merchant ILIKE ? OR notes ILIKE ?)");
    params.push(...Array(3).fill(`%${f.search}%`));
  }
  if (f.exclude_ids.length) {
    clauses.push(`id NOT IN (${f.exclude_ids.map(() => "?").join(", ")})`);
    params.push(...f.exclude_ids);
  }
  return [clauses.join(" AND ") || "TRUE", params];
}

function source(dimensions: Dimension[]): string {
  if (dimensions.includes("tag"))
    return (
      "(SELECT *, unnest(CASE WHEN cardinality(tags) = 0 THEN ARRAY['(untagged)'] ELSE tags END)" +
      " AS tag FROM reportable) src"
    );
  return "reportable";
}

function aggregateSql(q: AnalyticsQuery, f: Filters): [string, unknown[]] {
  const [where, params] = whereClause(f, q.measure);
  const value = MEASURES[q.measure][1];
  const dims = q.dimensions.map((d) => DIM_SQL[d]);
  const names = dims.map((_, i) => `d${i}`);
  const selectDims = dims.map((expr, i) => `${expr} AS d${i}`);
  const group = dims.length ? `GROUP BY ${names.join(", ")}` : "";

  const agg = {
    total: `SUM(${value})`,
    count: "COUNT(*)",
    avg: `AVG(${value})`,
    median: `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${value})`,
    pct_of_total: `SUM(${value})`,
    cumulative: `SUM(${value})`,
  }[q.metric];

  const inner =
    `SELECT ${[...selectDims, `${agg} AS value`, "COUNT(*) AS n"].join(", ")} ` +
    `FROM ${source(q.dimensions)} WHERE ${where} ${group}`;
  let outerValue = "value";
  if (q.metric === "pct_of_total") {
    const share = dims.length === 2 ? "PARTITION BY d0" : "";
    outerValue = `value / NULLIF(SUM(value) OVER (${share}), 0) * 100`;
  } else if (q.metric === "cumulative") {
    const partition = dims.length === 2 ? "PARTITION BY d1" : "";
    outerValue = `SUM(value) OVER (${partition} ORDER BY d0)`;
  }

  let order = {
    value_desc: "value DESC NULLS LAST",
    value_asc: "value ASC NULLS LAST",
    dimension: names.join(", ") || "value",
  }[q.sort];
  if ((dims.length && TIME_DIMS.has(q.dimensions[0])) || q.metric === "cumulative") order = names.join(", ");

  const sql =
    `SELECT ${[...names, `${outerValue} AS value`, "n"].join(", ")} ` +
    `FROM (${inner}) agg ORDER BY ${order} LIMIT ${q.limit}`;
  return [sql, params];
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => fmt(new Date(day(iso).getTime() + n * 86_400_000));

function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) return fmt(new Date(Date.UTC(y + years, m - 1, 28)));
  return fmt(target);
}

export function comparisonRange(q: AnalyticsQuery): [string, string] {
  const start = q.filters.start!;
  const end = q.filters.end!;
  if (q.compare === "custom") return [q.compare_start!, q.compare_end!];
  if (q.compare === "same_period_last_year") return [shiftYear(start, -1), shiftYear(end, -1)];
  const prevEnd = addDays(start, -1);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (sd === 1 && addDays(end, 1).endsWith("-01")) {
    const months = (ey - sy) * 12 + em - sm + 1;
    const first = sy * 12 + sm - 1 - months;
    return [fmt(new Date(Date.UTC(Math.floor(first / 12), first % 12, 1))), prevEnd];
  }
  const span = (day(end).getTime() - day(start).getTime()) / 86_400_000;
  return [addDays(prevEnd, -span), prevEnd];
}

export interface DiffRow {
  [dim: `d${number}`]: unknown;
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
  n: number;
  contribution: number | null;
}

function diffRows(current: Row[], previous: Row[], q: AnalyticsQuery): DiffRow[] {
  const n = q.dimensions.length;
  const key = (r: Row) => JSON.stringify(Array.from({ length: n }, (_, i) => r[`d${i}`]));
  const cur = new Map(current.map((r) => [key(r), r]));
  const prev = new Map(previous.map((r) => [key(r), r]));
  const keys = [...cur.keys(), ...[...prev.keys()].filter((k) => !cur.has(k))];
  const merged = keys.map((k) => {
    const c = Number(cur.get(k)?.value ?? 0);
    const p = Number(prev.get(k)?.value ?? 0);
    const dims = JSON.parse(k) as unknown[];
    const row: DiffRow = {
      current: c,
      previous: p,
      diff: c - p,
      pct: p ? ((c - p) / Math.abs(p)) * 100 : null,
      n: Number(cur.get(k)?.n ?? 0),
      contribution: null,
    };
    dims.forEach((v, i) => (row[`d${i}`] = v));
    return row;
  });
  const totalDiff = merged.reduce((s, r) => s + r.diff, 0);
  const additive = q.metric === "total" || q.metric === "count";
  for (const r of merged) r.contribution = additive && totalDiff ? (r.diff / totalDiff) * 100 : null;
  return merged.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export async function runQuery(db: Db, q: AnalyticsQuery) {
  const [sql, params] = aggregateSql(q, q.filters);
  const out: Record<string, unknown> = { dimensions: q.dimensions, rows: await db.query(sql, params), sql };

  if (q.compare !== "none") {
    const [prevStart, prevEnd] = comparisonRange(q);
    const prevFilters = { ...q.filters, start: prevStart, end: prevEnd };
    const unlimited = { ...q, limit: 5000 };
    const [cur, prev] = await Promise.all([
      db.query(...aggregateSql(unlimited, q.filters)),
      db.query(...aggregateSql(unlimited, prevFilters)),
    ]);
    out.rows = diffRows(cur, prev, q).slice(0, q.limit);
    out.compare_range = { start: prevStart, end: prevEnd };
    const totalsQ = { ...q, dimensions: [], limit: 1 };
    const [curTotal, prevTotal] = await Promise.all([
      db.query(...aggregateSql(totalsQ, q.filters)),
      db.query(...aggregateSql(totalsQ, prevFilters)),
    ]);
    out.totals = diffRows(curTotal, prevTotal, totalsQ)[0];
  }
  return out;
}

export const DrilldownSchema = z.object({
  query: AnalyticsQuerySchema,
  values: z.record(z.string(), z.string().nullable()).default({}),
  use_compare_range: z.boolean().default(false),
  limit: z.number().int().min(1).max(5000).default(500),
});
export type Drilldown = z.infer<typeof DrilldownSchema>;

export class BadRequest extends Error {}

export async function drilldown(db: Db, req: Drilldown) {
  const q = req.query;
  let f = q.filters;
  if (req.use_compare_range && q.compare !== "none") {
    const [start, end] = comparisonRange(q);
    f = { ...f, start, end };
  }
  let [where, params] = whereClause(f, q.measure);
  for (const [dim, val] of Object.entries(req.values)) {
    if (!(dim in DIM_SQL)) throw new BadRequest(`unknown dimension: ${dim}`);
    if (dim === "tag") {
      if (val === "(untagged)") where += " AND cardinality(tags) = 0";
      else {
        where += " AND ? = ANY(tags)";
        params = [...params, val];
      }
    } else {
      where += ` AND ${DIM_SQL[dim as Dimension]} = ?`;
      params = [...params, val];
    }
  }
  const value = MEASURES[q.measure][1];
  const [txns, totals] = await Promise.all([
    db.query(
      `SELECT *, ${value} AS value FROM reportable WHERE ${where} ORDER BY abs(amount) DESC LIMIT ${req.limit}`,
      params,
    ),
    db.query<{ total: number | null; n: number }>(
      `SELECT SUM(${value}) AS total, COUNT(*) AS n FROM reportable WHERE ${where}`,
      params,
    ),
  ]);
  return { transactions: txns, total: totals[0].total ?? 0, count: totals[0].n };
}
