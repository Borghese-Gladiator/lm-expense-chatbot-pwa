import { one, type Db, type Row } from "./db";

const PRE_TRIP_DAYS = 14;
const TRAVEL = /travel|flight|airline|hotel|lodging|rental car/i;

export interface Suggestion extends Row {
  id: number;
  score: number;
}

export async function suggestForTrip(db: Db, tripId: number): Promise<Suggestion[] | null> {
  const trip = await one<{ start_date: string | null; end_date: string | null }>(
    db,
    "SELECT start_date, end_date FROM trips WHERE id = ?",
    [tripId],
  );
  if (!trip) return null;
  if (!trip.start_date) return [];
  const end = trip.end_date ?? trip.start_date;
  const rows = await db.query<Row & { id: number; date: string; category: string; category_group: string }>(
    `SELECT r.*, (r.date >= ?::date) AS in_trip
     FROM reportable r
     WHERE r.date BETWEEN (?::date - ?::int) AND ?::date
       AND r.amount < 0
       AND r.txn_type <> 'transfer'
       AND r.category <> 'Subscriptions'
       AND NOT EXISTS (
         SELECT 1 FROM reportable o
         WHERE o.merchant = r.merchant AND o.amount = r.amount
           AND o.id <> r.id AND date_trunc('month', o.date) <> date_trunc('month', r.date))
       AND r.id NOT IN (SELECT transaction_id FROM trip_transactions WHERE trip_id = ?)`,
    [trip.start_date, trip.start_date, PRE_TRIP_DAYS, end, tripId],
  );
  return rows
    .map((r) => ({
      ...r,
      score: (TRAVEL.test(`${r.category} ${r.category_group}`) ? 2 : 0) + (r.in_trip ? 1 : 0.5),
    }))
    .sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));
}
