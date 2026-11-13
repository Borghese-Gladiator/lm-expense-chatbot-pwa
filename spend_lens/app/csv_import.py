"""CSV import with header aliases and idempotent dedupe.

Works with the Lunch Money transaction export and most bank exports.
Dedupe key: the file's own id column when present, otherwise a hash of
(account, date, amount, payee) plus how many times that tuple already appeared in the file.
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import io
import json
from decimal import Decimal, InvalidOperation
from typing import Literal

import duckdb
from pydantic import BaseModel

from app.db import category_id_for, scalar

ALIASES: dict[str, list[str]] = {
    "id": ["id", "transaction id", "transaction_id"],
    "date": ["date", "transaction date", "posted date", "posting date", "booking date"],
    "payee": ["payee", "description", "merchant", "name", "original_name", "memo"],
    "amount": ["amount", "transaction amount", "value"],
    "debit": ["debit", "withdrawal", "money out", "outflow"],
    "credit": ["credit", "deposit", "money in", "inflow"],
    "currency": ["currency"],
    "category": ["category", "category name", "category_name"],
    "group": ["category group", "category_group", "group"],
    "tags": ["tags", "tag", "labels"],
    "notes": ["notes", "note"],
    "account": ["account", "account name", "account_name", "asset", "plaid account name"],
    "status": ["status"],
    "is_income": ["is_income", "is income"],
    "exclude": ["exclude_from_totals", "excluded"],
}

DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"]


class CsvImportRequest(BaseModel):
    csv_text: str
    account_id: int | None = None
    sign: Literal["negative_is_expense", "positive_is_expense"] = "negative_is_expense"
    date_format: str | None = None


class CsvImportResult(BaseModel):
    added: int
    skipped_duplicates: int
    errors: list[str]
    accounts_created: list[str]


def _map_headers(headers: list[str]) -> dict[str, str]:
    lowered = {h.strip().lower(): h for h in headers}
    mapping: dict[str, str] = {}
    for field, names in ALIASES.items():
        for name in names:
            if name in lowered:
                mapping[field] = lowered[name]
                break
    return mapping


def _parse_date(value: str, fmt: str | None) -> datetime.date:
    for f in [fmt] if fmt else DATE_FORMATS:
        try:
            return datetime.datetime.strptime(value.strip(), f).date()
        except ValueError:
            continue
    raise ValueError(f"cannot read date {value!r}")


def _parse_money(value: str) -> Decimal:
    cleaned = value.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"cannot read amount {value!r}") from exc
    return -amount if negative else amount


def _account_for(db: duckdb.DuckDBPyConnection, name: str, currency: str, created: list[str]) -> int:
    existing = scalar(db, "SELECT id FROM accounts WHERE lower(name) = lower(?)", [name])
    if existing is not None:
        return int(existing)
    created.append(name)
    return int(
        scalar(
            db,
            "INSERT INTO accounts (name, source, currency) VALUES (?, 'csv', ?) RETURNING id",
            [name, currency],
        )
    )


def import_csv(db: duckdb.DuckDBPyConnection, req: CsvImportRequest, currency: str) -> CsvImportResult:
    reader = csv.DictReader(io.StringIO(req.csv_text.lstrip("﻿")))
    if not reader.fieldnames:
        raise ValueError("the file has no header row")
    m = _map_headers(list(reader.fieldnames))
    if "date" not in m:
        raise ValueError("no date column found")
    if "amount" not in m and not ("debit" in m or "credit" in m):
        raise ValueError("no amount, debit or credit column found")
    if "account" not in m and req.account_id is None:
        raise ValueError("choose an account, or include an account column")

    def get(row: dict[str, str], field: str) -> str:
        return (row.get(m[field]) or "").strip() if field in m else ""

    added = skipped = 0
    errors: list[str] = []
    created: list[str] = []
    seen: dict[str, int] = {}

    db.execute("BEGIN TRANSACTION")
    try:
        for line_no, row in enumerate(reader, start=2):
            try:
                date = _parse_date(get(row, "date"), req.date_format)
                if "amount" in m and get(row, "amount"):
                    amount = _parse_money(get(row, "amount"))
                    if req.sign == "positive_is_expense":
                        amount = -amount
                else:
                    debit = _parse_money(get(row, "debit")) if get(row, "debit") else Decimal(0)
                    credit = _parse_money(get(row, "credit")) if get(row, "credit") else Decimal(0)
                    amount = abs(credit) - abs(debit)
                row_currency = (get(row, "currency") or currency).upper()
                if req.account_id is not None:
                    account_id = req.account_id
                else:
                    account_id = _account_for(db, get(row, "account") or "Imported", row_currency, created)
                payee = get(row, "payee") or None

                source_id = get(row, "id")
                if not source_id:
                    base = f"{account_id}|{date}|{amount}|{(payee or '').lower()}"
                    seen[base] = seen.get(base, 0) + 1
                    source_id = hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest()[:24]
                    source_id = f"{account_id}:{source_id}"

                exists = scalar(
                    db,
                    "SELECT 1 FROM transactions WHERE source = 'csv' AND source_id = ?",
                    [source_id],
                )
                if exists:
                    skipped += 1
                    continue

                category_id = None
                if get(row, "category"):
                    category_id = category_id_for(db, get(row, "category"), get(row, "group") or None)
                tags = [t.strip() for t in get(row, "tags").split(",") if t.strip()]
                txn_type = None
                if get(row, "is_income").lower() == "true":
                    txn_type = "income"
                db.execute(
                    """INSERT INTO transactions
                       (source, source_id, account_id, date, amount, currency, payee_raw,
                        merchant, category_id, tags, notes, type, is_pending, raw)
                       VALUES ('csv', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    [
                        source_id,
                        account_id,
                        date,
                        amount,
                        row_currency,
                        payee,
                        payee,
                        category_id,
                        tags,
                        get(row, "notes") or None,
                        txn_type,
                        get(row, "status").lower() == "pending",
                        json.dumps(row),
                    ],
                )
                added += 1
            except ValueError as exc:
                errors.append(f"line {line_no}: {exc}")
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

    db.execute(
        """INSERT INTO sync_runs (source, finished_at, status, added, error)
           VALUES ('csv', current_timestamp, ?, ?, ?)""",
        ["ok" if not errors else "partial", added, "; ".join(errors[:5]) or None],
    )
    return CsvImportResult(added=added, skipped_duplicates=skipped, errors=errors, accounts_created=created)
