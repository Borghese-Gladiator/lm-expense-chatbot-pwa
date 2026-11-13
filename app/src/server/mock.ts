/** Demo mode: fake Plaid, fake Ask, and seed data. Revert the commit that adds this file to go back to real calls. */
import type { AnalyticsQuery } from "./analytics";
import type { AskResult } from "./ask";
import type { Settings } from "./config";
import { categoryIdFor, scalar, type Db } from "./db";

export const mockSettings = (s: Settings): Settings => ({
  ...s,
  plaidClientId: "mock",
  plaidSecret: "mock",
  appSecretKey: s.appSecretKey || "mock-secret-key-for-demo-only",
  anthropicApiKey: "mock",
});

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const PLAID_ACCOUNTS = [
  { account_id: "mock-chk", name: "Mock Bank Checking", type: "depository", subtype: "checking", balances: { current: 5230.12, iso_currency_code: "USD" } },
  { account_id: "mock-cc", name: "Mock Bank Card", type: "credit", subtype: "credit card", balances: { current: -812.4, iso_currency_code: "USD" } },
];

const plaidTxns = () => [
  ["mock-cc", 2, 23.5, "Blue Bottle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"],
  ["mock-cc", 3, 64.2, "Whole Foods", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"],
  ["mock-cc", 5, 18.75, "Uber", "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES"],
  ["mock-cc", 8, 129.99, "REI", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS"],
  ["mock-chk", 10, -4200, "Employer Inc", "INCOME", "INCOME_WAGES"],
].map(([account_id, ago, amount, name, primary, detailed], i) => ({
  transaction_id: `mock-txn-${i}`,
  account_id,
  date: iso(ago as number),
  amount,
  name,
  merchant_name: name,
  iso_currency_code: "USD",
  pending: ago === 2,
  personal_finance_category: { primary, detailed },
}));

/** Stands in for `fetch` inside PlaidClient. */
export const mockFetch: typeof fetch = async (input, init) => {
  const path = new URL(String(input)).pathname;
  const body = JSON.parse(String(init?.body ?? "{}"));
  const reply = ({
    "/link/token/create": { link_token: "mock-link-token" },
    "/item/public_token/exchange": { access_token: "mock-access-token", item_id: "mock-item" },
    "/accounts/get": { accounts: PLAID_ACCOUNTS },
    "/transactions/sync": body.cursor
      ? { added: [], modified: [], removed: [], accounts: PLAID_ACCOUNTS, next_cursor: body.cursor, has_more: false }
      : { added: plaidTxns(), modified: [], removed: [], accounts: PLAID_ACCOUNTS, next_cursor: "mock-cursor-1", has_more: false },
  } as Record<string, unknown>)[path];
  return reply
    ? Response.json(reply)
    : Response.json({ error_code: "MOCK_NOT_FOUND", error_message: path }, { status: 400 });
};

/** Keyword rules in place of the model. */
export async function mockAsk(db: Db, question: string): Promise<AskResult> {
  const q = question.toLowerCase();
  const start = iso(90);
  const end = iso(0);
  const category = (name: string) => scalar<number | undefined>(db, "SELECT id FROM categories WHERE lower(name) = ?", [name]);
  const base: Partial<AnalyticsQuery> = { measure: "spending", metric: "total", dimensions: ["category"], filters: { start, end } as AnalyticsQuery["filters"], compare: "none" };
  for (const name of ["restaurants", "groceries", "coffee", "travel", "shopping"]) {
    if (!q.includes(name.replace(/s$/, ""))) continue;
    const id = await category(name);
    return {
      query: { ...base, dimensions: ["month"], filters: { start: iso(365), end, category_ids: id ? [id] : [] } } as AnalyticsQuery,
      explanation: `(Mock) Monthly ${name} spending for the last 12 months.`,
    };
  }
  if (q.includes("income")) return { query: { ...base, measure: "income", dimensions: ["month"] } as AnalyticsQuery, explanation: "(Mock) Income by month, last 90 days." };
  if (q.includes("merchant")) return { query: { ...base, dimensions: ["merchant"], limit: 10 } as AnalyticsQuery, explanation: "(Mock) Top 10 merchants, last 90 days." };
  return { query: base as AnalyticsQuery, explanation: "(Mock) Spending by category, last 90 days." };
}

const CATS: [string, string, string[], [number, number], number][] = [
  ["Groceries", "Food", ["Whole Foods", "Trader Joe's", "Safeway"], [40, 160], 9],
  ["Restaurants", "Food", ["Sushi Place", "Taqueria", "Pizza Bar", "Thai Kitchen"], [18, 90], 8],
  ["Coffee", "Food", ["Starbucks", "Blue Bottle"], [4, 8], 14],
  ["Rideshare", "Transport", ["Uber", "Lyft"], [12, 40], 4],
  ["Gas", "Transport", ["Shell", "Chevron"], [35, 70], 2],
  ["Shopping", "Lifestyle", ["Amazon", "Target", "REI"], [15, 180], 5],
  ["Entertainment", "Lifestyle", ["AMC", "Steam", "Ticketmaster"], [12, 120], 2],
  ["Travel", "Lifestyle", ["Delta", "Airbnb", "Marriott"], [150, 900], 0.4],
];
const SUBS: [string, number, string][] = [
  ["Netflix", 15.49, "Subscriptions"],
  ["Spotify", 11.99, "Subscriptions"],
  ["Gym", 60, "Health"],
];

/** Two years of fake transactions. Returns the row count. */
export async function seedDemo(db: Db): Promise<number> {
  let state = 7;
  const random = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  const money = (n: number) => Math.round(n * 100) / 100;

  const checking = Number(await scalar(db, "INSERT INTO accounts (name, type, balance, balance_at) VALUES ('Demo Checking', 'checking', 8421.55, now()) RETURNING id"));
  const card = Number(await scalar(db, "INSERT INTO accounts (name, type, balance, balance_at) VALUES ('Demo Visa', 'credit', -1290.3, now()) RETURNING id"));
  const rent = await categoryIdFor(db, "Rent", "Housing");
  const pay = await categoryIdFor(db, "Paycheck", "Income");
  const cc = await categoryIdFor(db, "Credit Card Payment", "Transfers");
  const cat = new Map<string, number>();
  for (const [name, group] of CATS) cat.set(name, await categoryIdFor(db, name, group));
  for (const [, , name] of SUBS) cat.set(name, await categoryIdFor(db, name));

  const today = new Date();
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const rows: [number, string, number, string, number | null, string[]][] = [];
  for (let t = Date.UTC(today.getFullYear() - 2, today.getMonth(), 1); t <= end; t += 86_400_000) {
    const d = new Date(t);
    const day = d.toISOString().slice(0, 10);
    const dom = d.getUTCDate();
    if (dom === 1) rows.push([checking, day, -2400, "Landlord LLC", rent, []]);
    if (dom === 1 || dom === 15) rows.push([checking, day, 4200 + Math.floor(random() * 101) - 50, "Employer Inc", pay, []]);
    if (dom === 20) rows.push([checking, day, -1800, "Visa Payment", cc, []]);
    if (dom === 5)
      for (const [name, price, c] of SUBS) {
        const bump = name === "Netflix" && t > end - 200 * 86_400_000 ? 1.1 : 1;
        rows.push([card, day, -money(price * bump), name, cat.get(c)!, []]);
      }
    for (const [name, , merchants, [lo, hi], perMonth] of CATS) {
      const seasonal = name === "Restaurants" && [10, 11].includes(d.getUTCMonth()) ? 1.4 : 1;
      if (random() < (perMonth * seasonal) / 30) {
        let tags: string[] = name === "Restaurants" && [5, 6, 0].includes(d.getUTCDay()) ? ["date night"] : [];
        if (name === "Travel") tags = ["vacation"];
        const uncategorized = t > end - 14 * 86_400_000 && random() < 0.3;
        rows.push([card, day, -money(lo + random() * (hi - lo)), pick(merchants), uncategorized ? null : cat.get(name)!, tags]);
      }
    }
  }
  await db.tx(async (tx) => {
    for (const [a, date, amount, m, c, tags] of rows)
      await tx.query(
        `INSERT INTO transactions (source, account_id, date, amount, payee_raw, merchant, category_id, tags)
         VALUES ('manual', ?, ?, ?, ?, ?, ?, ?)`,
        [a, date, amount, m, m, c, tags],
      );
    await tx.query(
      "INSERT INTO saved_queries (name, query) VALUES (?, ?), (?, ?)",
      [
        "Food by month", JSON.stringify({ measure: "spending", metric: "total", dimensions: ["month", "category"], filters: { category_groups: ["Food"] }, compare: "none", chart: "stacked_bar" }),
        "Top merchants", JSON.stringify({ measure: "spending", metric: "total", dimensions: ["merchant"], filters: {}, compare: "none", limit: 15 }),
      ],
    );
  });
  return rows.length;
}

export async function seedIfEmpty(db: Db) {
  if (Number(await scalar(db, "SELECT COUNT(*) FROM accounts")) === 0) console.log(`mock: seeded ${await seedDemo(db)} transactions`);
}
