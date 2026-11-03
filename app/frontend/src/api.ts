export type Measure = "spending" | "income" | "net";
export type Metric = "total" | "count" | "avg" | "median" | "pct_of_total" | "cumulative";
export type Dimension =
  | "day" | "week" | "month" | "quarter" | "year"
  | "category" | "category_group" | "merchant" | "account" | "tag" | "type"
  | "day_of_week" | "weekend";
export type Compare = "none" | "previous_period" | "same_period_last_year" | "custom";
export type ChartKind = "auto" | "bar" | "line" | "area" | "stacked_bar" | "treemap" | "table";

export interface Filters {
  start?: string | null;
  end?: string | null;
  account_ids?: number[];
  category_ids?: number[];
  category_groups?: string[];
  merchants?: string[];
  tags?: string[];
  types?: string[];
  amount_min?: number | null;
  amount_max?: number | null;
  search?: string | null;
  include_pending?: boolean;
  include_excluded_categories?: boolean;
  exclude_ids?: number[];
}

export interface AnalyticsQuery {
  measure: Measure;
  metric: Metric;
  dimensions: Dimension[];
  filters: Filters;
  compare: Compare;
  compare_start?: string | null;
  compare_end?: string | null;
  sort?: "value_desc" | "value_asc" | "dimension";
  limit?: number;
  chart?: ChartKind;
}

export interface QueryRow {
  d0?: string;
  d1?: string;
  value?: number;
  n: number;
  current?: number;
  previous?: number;
  diff?: number;
  pct?: number | null;
  contribution?: number | null;
}

export interface QueryResult {
  dimensions: Dimension[];
  rows: QueryRow[];
  totals?: QueryRow;
  compare_range?: { start: string; end: string };
}

export interface Txn {
  id: number;
  date: string;
  amount: number;
  currency: string;
  payee_raw: string | null;
  merchant: string;
  account_id: number;
  account: string;
  category_id: number | null;
  category: string;
  category_group: string;
  tags: string[];
  notes: string | null;
  txn_type: string;
  is_pending: boolean;
  reviewed: boolean;
  source: string;
  value?: number;
}

export interface Category {
  id: number;
  name: string;
  group_name: string | null;
  kind: "expense" | "income" | "transfer";
  exclude_from_totals: boolean;
  archived: boolean;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  institution: string | null;
  source: string;
  currency: string;
  balance: number | null;
  balance_at: string | null;
  archived: boolean;
  plaid_item_id: number | null;
  txn_count: number;
}

export interface Meta {
  currency: string;
  plaid_configured: boolean;
  plaid_env: string;
  ask_configured: boolean;
  categories: Category[];
  accounts: Account[];
  tags: string[];
  groups: string[];
  date_bounds: { start: string | null; end: string | null };
}

export interface Drill {
  query: AnalyticsQuery;
  values: Partial<Record<Dimension, string>>;
  use_compare_range?: boolean;
  title: string;
  onExclude?: (id: number) => void;
}

export class ApiError extends Error {}

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const runQuery = (q: AnalyticsQuery) => api<QueryResult>("/analytics/query", q);

export const DIM_LABEL: Record<Dimension, string> = {
  day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year",
  category: "Category", category_group: "Category group", merchant: "Merchant",
  account: "Account", tag: "Tag", type: "Type", day_of_week: "Day of week", weekend: "Weekday / weekend",
};
export const TIME_DIMS: Dimension[] = ["day", "week", "month", "quarter", "year"];
export const METRIC_LABEL: Record<Metric, string> = {
  total: "Total", count: "Count", avg: "Average", median: "Median",
  pct_of_total: "% of total", cumulative: "Running total",
};
export const MEASURE_LABEL: Record<Measure, string> = { spending: "Spending", income: "Income", net: "Net cash flow" };
