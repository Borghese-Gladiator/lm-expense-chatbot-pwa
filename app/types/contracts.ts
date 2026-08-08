// TypeScript equivalents of the Pydantic data contracts.
// Mirrors app/models/{queries,answers,domain}.py.

export interface DateRange {
  start: string; // ISO date (YYYY-MM-DD)
  end: string;
}

export interface Provenance {
  sql: string;
  row_count: number;
  date_range: DateRange | null;
  last_synced_at: string | null; // ISO datetime
  result_id: string;
}

export interface QueryResult {
  result_id: string;
  columns: string[];
  column_types: string[];
  rows: Array<Array<unknown>>;
  row_count: number;
  truncated: boolean;
  provenance: Provenance;
}

export interface AnalysisRecord {
  result_id: string;
  question: string;
  sql: string;
  created_at: string;
  row_count: number;
  view_spec: ViewSpec | null;
}

export interface QueryRequest {
  question: string;
  result_id?: string | null;
}

export interface SyncRequest {
  start?: string | null;
  end?: string | null;
}

export interface Fact {
  label: string;
  value: string;
  raw_value: number | string | null;
  unit: string | null;
}

export type ChartType =
  | "metric"
  | "table"
  | "line"
  | "bar"
  | "grouped_bar"
  | "stacked_bar"
  | "area"
  | "scatter"
  | "donut";

export type EncodingType = "quantitative" | "nominal" | "temporal" | "ordinal";

export interface Encoding {
  field: string;
  type: EncodingType;
  aggregate?: string | null;
}

export interface ViewSpec {
  chart_type: ChartType;
  x?: Encoding | null;
  y?: Encoding | null;
  color?: Encoding | null;
  title?: string | null;
}

export type AnswerBlockKind = "insight" | "metric" | "table" | "chart";

export interface AnswerBlock {
  kind: AnswerBlockKind;
  text?: string | null;
  facts?: Fact[] | null;
  view_spec?: ViewSpec | null;
  vega_lite?: Record<string, unknown> | null;
  result_id?: string | null;
}

export interface AnswerEnvelope {
  question: string;
  blocks: AnswerBlock[];
  provenance: Provenance;
  result_id: string;
}

export interface SyncResult {
  synced: boolean;
  transactions_written: number;
  transactions_dropped: number;
  date_range: DateRange;
  last_synced_at: string;
}

export interface NormalizedAccount {
  account_key: string;
  source: "manual" | "plaid";
  source_id: number;
  name: string;
  currency: string;
  balance: string | null; // Decimal serialized as string
}

export interface NormalizedTransaction {
  id: number;
  date: string;
  account_key: string;
  amount: string;
  base_amount: string;
  currency: string;
  payee: string | null;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  is_transfer: boolean;
  is_pending: boolean;
  is_income: boolean;
  excluded_from_totals: boolean;
  parent_id: number | null;
}
