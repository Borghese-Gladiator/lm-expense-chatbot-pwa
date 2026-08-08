"""Finance catalog model + builder (the read-only semantic surface for the agent)."""

from __future__ import annotations

import datetime

import duckdb
from pydantic import BaseModel

from app.models.queries import DateRange

_TABLE_DESCRIPTIONS: dict[str, str] = {
    "transactions": "Raw normalized transactions (all rows, including splits and parents).",
    "transactions_visible": "Non-split-child transactions (parents kept, children hidden).",
    "transaction_components": "Leaf-level rows: split children expanded, split parents removed.",
    "transactions_included_in_totals": (
        "Rows counting toward spend/income/net: excludes transfers, pending, and excluded rows. "
        "Use this for totals."
    ),
    "accounts": "Unified manual + plaid accounts keyed by manual:<id> / plaid:<id>.",
    "categories": "Category id -> name.",
    "budget_performance": "Budgeted vs actual by category and period, with variance.",
}


class CatalogTable(BaseModel):
    name: str
    description: str
    columns: list[dict[str, str]]


class FinanceCatalog(BaseModel):
    tables: list[CatalogTable]
    sign_rules: str
    base_currency: str
    date_bounds: DateRange | None = None


def _columns_for(db: duckdb.DuckDBPyConnection, name: str) -> list[dict[str, str]]:
    try:
        rows = db.execute(f"DESCRIBE analytics.{name}").fetchall()
    except duckdb.Error:
        return []
    return [{"name": str(r[0]), "type": str(r[1])} for r in rows]


def _date_bounds(db: duckdb.DuckDBPyConnection) -> DateRange | None:
    row = db.execute(
        "SELECT MIN(date), MAX(date) FROM analytics.transactions"
    ).fetchone()
    if not row or row[0] is None or row[1] is None:
        return None
    return DateRange(start=_as_date(row[0]), end=_as_date(row[1]))


def _as_date(value: object) -> datetime.date:
    if isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(str(value))


def build_catalog(
    db: duckdb.DuckDBPyConnection,
    base_currency: str,
    last_synced_at: datetime.datetime | None,
) -> FinanceCatalog:
    from app.agent.prompts import SIGN_RULES

    tables = [
        CatalogTable(
            name=f"analytics.{name}",
            description=desc,
            columns=_columns_for(db, name),
        )
        for name, desc in _TABLE_DESCRIPTIONS.items()
    ]
    return FinanceCatalog(
        tables=tables,
        sign_rules=SIGN_RULES,
        base_currency=base_currency,
        date_bounds=_date_bounds(db),
    )
