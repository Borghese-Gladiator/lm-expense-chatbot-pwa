/** Fill the database with 2 years of fake transactions. Usage: npm run seed (uses DATABASE_URL or PGLITE_DIR). */
import { loadSettings } from "../src/server/config";
import { categoryIdFor, openDb, scalar } from "../src/server/db";

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

let state = 7;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
const money = (n: number) => Math.round(n * 100) / 100;

const db = await openDb(loadSettings());
const checking = Number(await scalar(db, "INSERT INTO accounts (name, type) VALUES ('Demo Checking', 'checking') RETURNING id"));
const card = Number(await scalar(db, "INSERT INTO accounts (name, type) VALUES ('Demo Visa', 'credit') RETURNING id"));
const rent = await categoryIdFor(db, "Rent", "Housing");
const pay = await categoryIdFor(db, "Paycheck", "Income");
const cc = await categoryIdFor(db, "Credit Card Payment", "Transfers");
const cat = new Map<string, number>();
for (const [name, group] of CATS) cat.set(name, await categoryIdFor(db, name, group));
for (const [, , name] of SUBS) cat.set(name, await categoryIdFor(db, name));

const today = new Date();
const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
const rows: [number, string, number, string, number, string[]][] = [];
for (let t = Date.UTC(today.getFullYear() - 2, today.getMonth(), 1); t <= end; t += 86_400_000) {
  const d = new Date(t);
  const iso = d.toISOString().slice(0, 10);
  const dom = d.getUTCDate();
  if (dom === 1) rows.push([checking, iso, -2400, "Landlord LLC", rent, []]);
  if (dom === 1 || dom === 15) rows.push([checking, iso, 4200 + Math.floor(random() * 101) - 50, "Employer Inc", pay, []]);
  if (dom === 20) rows.push([checking, iso, -1800, "Visa Payment", cc, []]);
  if (dom === 5)
    for (const [name, price, c] of SUBS) {
      const bump = name === "Netflix" && t > end - 200 * 86_400_000 ? 1.1 : 1;
      rows.push([card, iso, -money(price * bump), name, cat.get(c)!, []]);
    }
  for (const [name, , merchants, [lo, hi], perMonth] of CATS) {
    const seasonal = name === "Restaurants" && [10, 11].includes(d.getUTCMonth()) ? 1.4 : 1;
    if (random() < (perMonth * seasonal) / 30) {
      let tags: string[] = name === "Restaurants" && [5, 6, 0].includes(d.getUTCDay()) ? ["date night"] : [];
      if (name === "Travel") tags = ["vacation"];
      rows.push([card, iso, -money(lo + random() * (hi - lo)), pick(merchants), cat.get(name)!, tags]);
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
});
console.log(`seeded ${rows.length} transactions`);
await db.close();
