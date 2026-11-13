import datetime

import pytest

from app.db import category_id_for, connect, scalar


@pytest.fixture
def db():
    conn = connect(":memory:")
    yield conn
    conn.close()


def add_account(db, name="Checking"):
    return scalar(db, "INSERT INTO accounts (name) VALUES (?) RETURNING id", [name])


def add_txn(db, account, day, amount, merchant, category=None, **kw):
    cat = category_id_for(db, category) if category else None
    return scalar(
        db,
        """INSERT INTO transactions (source, account_id, date, amount, merchant, payee_raw,
               category_id, tags, type, is_pending, parent_id)
           VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        [
            account,
            datetime.date.fromisoformat(day),
            amount,
            merchant,
            merchant,
            cat,
            kw.get("tags", []),
            kw.get("type"),
            kw.get("pending", False),
            kw.get("parent"),
        ],
    )


@pytest.fixture
def seeded(db):
    a = add_account(db)
    add_txn(db, a, "2026-09-03", -50, "Whole Foods", "Groceries", tags=["home"])
    add_txn(db, a, "2026-09-10", -30, "Sushi Place", "Restaurants", tags=["date night"])
    add_txn(db, a, "2026-09-15", 3000, "Employer", "Paycheck")
    add_txn(db, a, "2026-09-20", -500, "Card Payment", "Credit Card Payment")
    add_txn(db, a, "2026-10-02", -80, "Whole Foods", "Groceries")
    add_txn(db, a, "2026-10-05", -120, "Sushi Place", "Restaurants", tags=["date night"])
    add_txn(db, a, "2026-10-06", 20, "Sushi Place", "Restaurants")
    add_txn(db, a, "2026-10-07", -40, "Pending Cafe", "Restaurants", pending=True)
    parent = add_txn(db, a, "2026-10-12", -100, "Target", "Shopping")
    add_txn(db, a, "2026-10-12", -60, "Target", "Shopping", parent=parent)
    add_txn(db, a, "2026-10-12", -40, "Target", "Groceries", parent=parent)
    add_txn(db, a, "2026-10-15", 3000, "Employer", "Paycheck")
    return db
