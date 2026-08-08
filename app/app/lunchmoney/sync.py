"""Snapshot sync: staging -> validate -> replace date window in a txn -> refresh views.

Idempotent: re-running for the same window produces the same end state and drops
transactions that vanished from the source within that window.
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import duckdb

from app.analytics.semantic_views import refresh_views
from app.lunchmoney.client import LunchMoneyClient
from app.lunchmoney.normalization import normalize_snapshot
from app.models.domain import NormalizedAccount, NormalizedTransaction
from app.models.queries import DateRange, SyncResult

_LAST_SYNCED_AT: datetime.datetime | None = None


def get_last_synced_at() -> datetime.datetime | None:
    return _LAST_SYNCED_AT


def _stage_rows(
    db: duckdb.DuckDBPyConnection,
    txns: list[NormalizedTransaction],
    accounts: list[NormalizedAccount],
) -> None:
    db.execute("DELETE FROM staging.transactions")
    db.execute("DELETE FROM staging.accounts")
    for t in txns:
        db.execute(
            """INSERT INTO staging.transactions VALUES
               (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                t.id, t.date, t.account_key, t.amount, t.base_amount, t.currency,
                t.payee, t.category_id, t.category_name, t.tags, t.is_transfer,
                t.is_pending, t.is_income, t.excluded_from_totals, t.parent_id,
            ],
        )
    for a in accounts:
        db.execute(
            "INSERT INTO staging.accounts VALUES (?,?,?,?,?,?)",
            [a.account_key, a.source, a.source_id, a.name, a.currency, a.balance],
        )


def _validate_staging(db: duckdb.DuckDBPyConnection) -> None:
    null_dates = db.execute(
        "SELECT COUNT(*) FROM staging.transactions WHERE date IS NULL"
    ).fetchone()
    if null_dates and null_dates[0] > 0:
        raise ValueError("malformed snapshot: transactions with NULL date in staging")

    null_ids = db.execute(
        "SELECT COUNT(*) FROM staging.transactions WHERE id IS NULL"
    ).fetchone()
    if null_ids and null_ids[0] > 0:
        raise ValueError("malformed snapshot: transactions with NULL id in staging")

    dup_ids = db.execute(
        "SELECT COUNT(*) FROM (SELECT id FROM staging.transactions GROUP BY id HAVING COUNT(*) > 1)"
    ).fetchone()
    if dup_ids and dup_ids[0] > 0:
        raise ValueError("malformed snapshot: duplicate transaction ids in staging")


def _replace_window(
    db: duckdb.DuckDBPyConnection,
    start: datetime.date,
    end: datetime.date,
) -> tuple[int, int]:
    existing = db.execute(
        "SELECT COUNT(*) FROM analytics.transactions WHERE date BETWEEN ? AND ?",
        [start, end],
    ).fetchone()
    existing_count = int(existing[0]) if existing else 0

    incoming = db.execute("SELECT COUNT(*) FROM staging.transactions").fetchone()
    incoming_count = int(incoming[0]) if incoming else 0

    db.execute(
        "DELETE FROM analytics.transactions WHERE date BETWEEN ? AND ?", [start, end]
    )
    db.execute(
        "INSERT INTO analytics.transactions SELECT * FROM staging.transactions"
    )

    db.execute("DELETE FROM analytics.accounts")
    db.execute("INSERT INTO analytics.accounts SELECT * FROM staging.accounts")

    dropped = max(existing_count - incoming_count, 0)
    return incoming_count, dropped


async def sync_snapshot(
    client: LunchMoneyClient,
    db: duckdb.DuckDBPyConnection,
    start: datetime.date,
    end: datetime.date,
    base_currency: str,
) -> SyncResult:
    global _LAST_SYNCED_AT

    raw_txns = await client.get_transactions(start, end)
    raw_accounts = await client.get_accounts()
    raw_categories = await client.get_categories()
    raw_tags = await client.get_tags()

    txns, accounts = normalize_snapshot(
        raw_txns, raw_accounts, raw_categories, raw_tags, base_currency
    )

    db.execute("BEGIN TRANSACTION")
    try:
        _stage_rows(db, txns, accounts)
        _validate_staging(db)
        written, dropped = _replace_window(db, start, end)
        _upsert_categories(db, raw_categories)
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

    refresh_views(db)
    _LAST_SYNCED_AT = datetime.datetime.now(datetime.timezone.utc)

    return SyncResult(
        synced=True,
        transactions_written=written,
        transactions_dropped=dropped,
        date_range=DateRange(start=start, end=end),
        last_synced_at=_LAST_SYNCED_AT,
    )


def _upsert_categories(
    db: duckdb.DuckDBPyConnection, raw_categories: list[dict[str, object]]
) -> None:
    db.execute("DELETE FROM analytics.categories")
    for c in raw_categories:
        db.execute(
            "INSERT INTO analytics.categories VALUES (?, ?)",
            [int(c["id"]), str(c["name"])],  # type: ignore[call-overload]
        )


def seed_reference(
    db: duckdb.DuckDBPyConnection,
    txns: list[NormalizedTransaction],
    accounts: list[NormalizedAccount],
    categories: dict[int, str] | None = None,
    budgets: list[dict[str, object]] | None = None,
) -> None:
    """Directly load a normalized dataset (used by tests / offline seeding)."""
    db.execute("DELETE FROM analytics.transactions")
    db.execute("DELETE FROM analytics.accounts")
    db.execute("DELETE FROM analytics.categories")
    db.execute("DELETE FROM analytics.budgets")
    _stage_rows(db, txns, accounts)
    db.execute("INSERT INTO analytics.transactions SELECT * FROM staging.transactions")
    db.execute("INSERT INTO analytics.accounts SELECT * FROM staging.accounts")
    if categories:
        for cid, name in categories.items():
            db.execute("INSERT INTO analytics.categories VALUES (?, ?)", [cid, name])
    if budgets:
        for b in budgets:
            db.execute(
                "INSERT INTO analytics.budgets VALUES (?,?,?,?,?)",
                [
                    b["category_id"],
                    b["category_name"],
                    b["period_start"],
                    Decimal(str(b["budgeted"])),
                    Decimal(str(b["actual"])),
                ],
            )
    refresh_views(db)
