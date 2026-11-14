import type { Db } from "./db";

const TRAVEL_CATEGORIES = ["travel", "flights", "airfare", "lodging", "hotels", "hotel", "car rental", "vacation"];
const TRAVEL_MERCHANTS =
  /\b(delta|united|american air|southwest|jetblue|airlines?|airways?|airbnb|vrbo|marriott|hilton|hyatt|hotel|hostel|expedia|booking\.com|hertz|avis|amtrak)\b/i;
const PRE_TRIP_DAYS = 14;
const CLUSTER_GAP_DAYS = 2;
const DAY = 86_400_000;

export interface TripCandidate {
  id: number;
  date: string;
  merchant: string | null;
  amount: number;
  score: number;
  reasons: string[];
}

export interface TripSuggestion {
  name: string;
  start_date: string;
  end_date: string;
  transaction_ids: number[];
  candidates: TripCandidate[];
  score: number;
}

interface TxnRow {
  id: number;
  date: string;
  amount: string | number;
  currency: string;
  merchant: string | null;
  payee_raw: string | null;
  type: string | null;
  tags: string[] | null;
  category: string | null;
  category_kind: string | null;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const monthOf = (d: string) => d.slice(0, 7);
const keyOf = (r: TxnRow) => (r.merchant ?? r.payee_raw ?? "").trim().toLowerCase();

function isTransfer(r: TxnRow): boolean {
  return r.type === "transfer" || r.type === "adjustment" || r.category_kind === "transfer";
}

/** Recurring: tagged so, or the same merchant at a similar amount in 3+ distinct months. */
function recurringIds(rows: TxnRow[]): Set<number> {
  const out = new Set<number>();
  const byMerchant = new Map<string, TxnRow[]>();
  for (const r of rows) {
    if ((r.tags ?? []).some((t) => t.toLowerCase() === "recurring" || t.toLowerCase() === "subscription")) out.add(r.id);
    const k = keyOf(r);
    if (k) byMerchant.set(k, [...(byMerchant.get(k) ?? []), r]);
  }
  for (const list of byMerchant.values()) {
    const groups: TxnRow[][] = [];
    for (const r of list) {
      const a = Math.abs(Number(r.amount));
      const g = groups.find((g) => Math.abs(Math.abs(Number(g[0].amount)) - a) <= 0.1 * Math.abs(Number(g[0].amount)));
      if (g) g.push(r);
      else groups.push([r]);
    }
    for (const g of groups) if (new Set(g.map((r) => monthOf(r.date))).size >= 3) g.forEach((r) => out.add(r.id));
  }
  return out;
}

export async function suggestTrips(db: Db, opts: { homeCurrency?: string } = {}): Promise<TripSuggestion[]> {
  const rows = await db.query<TxnRow>(
    `SELECT t.id, t.date::text AS date, t.amount, t.currency, t.merchant, t.payee_raw, t.type, t.tags,
            c.name AS category, c.kind AS category_kind
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.parent_id IS NULL ORDER BY t.date, t.id`,
  );
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const home = opts.homeCurrency ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

  const recurring = recurringIds(rows);
  const usable = rows.filter((r) => Number(r.amount) < 0 && !isTransfer(r) && !recurring.has(r.id));

  const travelCat = (r: TxnRow) => !!r.category && TRAVEL_CATEGORIES.includes(r.category.toLowerCase());
  const travelMerchant = (r: TxnRow) => TRAVEL_MERCHANTS.test(`${r.merchant ?? ""} ${r.payee_raw ?? ""}`);
  const foreign = (r: TxnRow) => r.currency !== home;

  // Core rows: on-trip signals (travel category or foreign currency).
  const core = usable.filter((r) => travelCat(r) || foreign(r));
  const coreDays = [...new Set(core.map((r) => dayNum(r.date)))].sort((a, b) => a - b);
  const windows: [number, number][] = [];
  for (const d of coreDays) {
    const last = windows[windows.length - 1];
    if (last && d - last[1] <= CLUSTER_GAP_DAYS) last[1] = d;
    else windows.push([d, d]);
  }

  const suggestions: TripSuggestion[] = [];
  for (const [start, end] of windows) {
    const candidates: TripCandidate[] = [];
    for (const r of usable) {
      const d = dayNum(r.date);
      const reasons: string[] = [];
      let score = 0;
      if (d >= start && d <= end) {
        if (travelCat(r)) (score += 2), reasons.push("travel category");
        if (foreign(r)) (score += 2), reasons.push("foreign currency");
        if (travelMerchant(r)) (score += 1), reasons.push("travel merchant");
      } else if (d < start && d >= start - PRE_TRIP_DAYS) {
        // Pre-trip window: only travel purchases (flights, lodging) count.
        if (travelMerchant(r) || travelCat(r)) (score += 1), reasons.push("pre-trip travel merchant");
      }
      if (score > 0)
        candidates.push({ id: r.id, date: r.date, merchant: r.merchant, amount: Number(r.amount), score, reasons });
    }
    const foreignCur = usable.find((r) => foreign(r) && dayNum(r.date) >= start && dayNum(r.date) <= end)?.currency;
    suggestions.push({
      name: `Trip ${dayStr(start)}${foreignCur ? ` (${foreignCur})` : ""}`,
      start_date: dayStr(start),
      end_date: dayStr(end),
      transaction_ids: candidates.map((c) => c.id),
      candidates,
      score: candidates.reduce((s, c) => s + c.score, 0),
    });
  }
  return suggestions.sort((a, b) => b.score - a.score);
}
