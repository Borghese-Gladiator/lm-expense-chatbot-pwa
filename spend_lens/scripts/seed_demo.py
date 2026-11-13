"""Fill a DuckDB file with 2 years of fake transactions. Usage: python scripts/seed_demo.py [path]"""

from __future__ import annotations

import datetime
import random
import sys

from app.db import category_id_for, connect, scalar

CATS = [
    ("Groceries", "Food", ["Whole Foods", "Trader Joe's", "Safeway"], (40, 160), 9),
    ("Restaurants", "Food", ["Sushi Place", "Taqueria", "Pizza Bar", "Thai Kitchen"], (18, 90), 8),
    ("Coffee", "Food", ["Starbucks", "Blue Bottle"], (4, 8), 14),
    ("Rideshare", "Transport", ["Uber", "Lyft"], (12, 40), 4),
    ("Gas", "Transport", ["Shell", "Chevron"], (35, 70), 2),
    ("Shopping", "Lifestyle", ["Amazon", "Target", "REI"], (15, 180), 5),
    ("Entertainment", "Lifestyle", ["AMC", "Steam", "Ticketmaster"], (12, 120), 2),
    ("Travel", "Lifestyle", ["Delta", "Airbnb", "Marriott"], (150, 900), 0.4),
]
SUBS = [("Netflix", 15.49, "Subscriptions"), ("Spotify", 11.99, "Subscriptions"), ("Gym", 60, "Health")]


def main(path: str) -> None:
    db = connect(path)
    random.seed(7)
    checking = scalar(
        db, "INSERT INTO accounts (name, type) VALUES ('Demo Checking', 'checking') RETURNING id"
    )
    card = scalar(db, "INSERT INTO accounts (name, type) VALUES ('Demo Visa', 'credit') RETURNING id")
    rent = category_id_for(db, "Rent", "Housing")
    pay = category_id_for(db, "Paycheck", "Income")
    cc = category_id_for(db, "Credit Card Payment", "Transfers")
    today = datetime.date.today()
    day = datetime.date(today.year - 2, today.month, 1)
    rows = []
    while day <= today:
        if day.day == 1:
            rows.append((checking, day, -2400, "Landlord LLC", rent, []))
        if day.day in (1, 15):
            rows.append((checking, day, 4200 + random.randint(-50, 50), "Employer Inc", pay, []))
        if day.day == 20:
            rows.append((checking, day, -1800, "Visa Payment", cc, []))
        for name, price, cat in SUBS:
            if day.day == 5:
                bump = 1.1 if name == "Netflix" and day > today - datetime.timedelta(days=200) else 1
                rows.append((card, day, -round(price * bump, 2), name, category_id_for(db, cat), []))
        for cat, group, merchants, (lo, hi), per_month in CATS:
            seasonal = 1.4 if cat == "Restaurants" and day.month in (11, 12) else 1
            if random.random() < per_month * seasonal / 30:
                tags = ["date night"] if cat == "Restaurants" and day.weekday() >= 4 else []
                if cat == "Travel":
                    tags = ["vacation"]
                rows.append(
                    (
                        card,
                        day,
                        -round(random.uniform(lo, hi), 2),
                        random.choice(merchants),
                        category_id_for(db, cat, group),
                        tags,
                    )
                )
        day += datetime.timedelta(days=1)
    db.executemany(
        """INSERT INTO transactions (source, account_id, date, amount, payee_raw, merchant, category_id, tags)
           VALUES ('manual', ?, ?, ?, ?, ?, ?, ?)""",
        [(a, d, amt, m, m, c, t) for a, d, amt, m, c, t in rows],
    )
    print(f"seeded {len(rows)} transactions into {path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "finance.duckdb")
