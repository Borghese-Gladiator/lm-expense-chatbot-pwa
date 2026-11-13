import type { Dimension, Metric } from "./api";

let currency = "USD";
export const setCurrency = (c: string) => {
  currency = c;
};

export const money = (v: number | null | undefined, digits = 0) =>
  v == null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(v);

export const money2 = (v: number | null | undefined) => money(v, 2);

export const compactMoney = (v: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export const signedMoney = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;

export const metricValue = (metric: Metric, v: number | null | undefined) => {
  if (v == null) return "—";
  if (metric === "count") return v.toLocaleString();
  if (metric === "pct_of_total") return `${v.toFixed(1)}%`;
  return money(v, metric === "avg" || metric === "median" ? 2 : 0);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dimValue = (dim: Dimension | undefined, v: string | undefined) => {
  if (v == null) return "—";
  if (!dim) return v;
  const [y, m, d] = v.split("-");
  switch (dim) {
    case "month":
      return `${MONTHS[Number(m) - 1]} ${y}`;
    case "quarter":
      return `Q${Math.floor((Number(m) - 1) / 3) + 1} ${y}`;
    case "year":
      return y;
    case "week":
    case "day":
      return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
    case "day_of_week":
      return v.slice(2);
    default:
      return v;
  }
};

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type Preset = "this_month" | "last_month" | "last_3" | "last_12" | "ytd" | "last_year" | "all" | "custom";

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3", label: "Last 3 months" },
  { id: "last_12", label: "Last 12 months" },
  { id: "ytd", label: "Year to date" },
  { id: "last_year", label: "Last year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

export function presetRange(p: Preset, today = new Date()): { start: string | null; end: string | null } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (p) {
    case "this_month":
      return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
    case "last_3":
      return { start: iso(new Date(y, m - 2, 1)), end: iso(new Date(y, m + 1, 0)) };
    case "last_12":
      return { start: iso(new Date(y, m - 11, 1)), end: iso(new Date(y, m + 1, 0)) };
    case "ytd":
      return { start: iso(new Date(y, 0, 1)), end: iso(today) };
    case "last_year":
      return { start: iso(new Date(y - 1, 0, 1)), end: iso(new Date(y - 1, 11, 31)) };
    default:
      return { start: null, end: null };
  }
}
