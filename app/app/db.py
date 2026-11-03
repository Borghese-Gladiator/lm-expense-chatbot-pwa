from __future__ import annotations

from typing import Any

import duckdb

SCHEMA = """
CREATE SEQUENCE IF NOT EXISTS seq_id START 1;

CREATE TABLE IF NOT EXISTS plaid_items (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    item_id VARCHAR UNIQUE NOT NULL,
    institution VARCHAR,
    access_token_enc VARCHAR NOT NULL,
    cursor VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'ok',
    error VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL DEFAULT 'other',
    institution VARCHAR,
    source VARCHAR NOT NULL DEFAULT 'manual',
    source_id VARCHAR,
    plaid_item_id BIGINT,
    currency VARCHAR NOT NULL DEFAULT 'USD',
    balance DECIMAL(18, 2),
    balance_at TIMESTAMP,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    name VARCHAR UNIQUE NOT NULL,
    group_name VARCHAR,
    kind VARCHAR NOT NULL DEFAULT 'expense',
    exclude_from_totals BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    source VARCHAR NOT NULL,
    source_id VARCHAR,
    account_id BIGINT NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    currency VARCHAR NOT NULL DEFAULT 'USD',
    payee_raw VARCHAR,
    merchant VARCHAR,
    category_id BIGINT,
    tags VARCHAR[] NOT NULL DEFAULT [],
    notes VARCHAR,
    type VARCHAR,
    is_pending BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    user_edited BOOLEAN NOT NULL DEFAULT FALSE,
    parent_id BIGINT,
    raw JSON,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    source VARCHAR NOT NULL,
    plaid_item_id BIGINT,
    started_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    finished_at TIMESTAMP,
    status VARCHAR NOT NULL DEFAULT 'running',
    added INTEGER NOT NULL DEFAULT 0,
    modified INTEGER NOT NULL DEFAULT 0,
    removed INTEGER NOT NULL DEFAULT 0,
    error VARCHAR
);

CREATE TABLE IF NOT EXISTS saved_queries (
    id BIGINT PRIMARY KEY DEFAULT nextval('seq_id'),
    name VARCHAR NOT NULL,
    query JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE OR REPLACE VIEW reportable AS
SELECT
    t.id,
    t.date,
    t.amount,
    t.currency,
    t.payee_raw,
    COALESCE(t.merchant, t.payee_raw, '(unknown)') AS merchant,
    t.account_id,
    a.name AS account,
    t.category_id,
    COALESCE(c.name, 'Uncategorized') AS category,
    COALESCE(c.group_name, c.name, 'Uncategorized') AS category_group,
    t.tags,
    t.notes,
    COALESCE(t.type, c.kind, 'expense') AS txn_type,
    COALESCE(c.exclude_from_totals, FALSE) AS category_excluded,
    t.is_pending,
    t.reviewed,
    t.source,
    t.parent_id
FROM transactions t
LEFT JOIN accounts a ON a.id = t.account_id
LEFT JOIN categories c ON c.id = t.category_id
WHERE NOT EXISTS (SELECT 1 FROM transactions ch WHERE ch.parent_id = t.id);
"""


def connect(path: str) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(path)
    conn.execute(SCHEMA)
    return conn


def rows(db: duckdb.DuckDBPyConnection, sql: str, params: list[Any] | None = None) -> list[dict]:
    cur = db.execute(sql, params or [])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r, strict=True)) for r in cur.fetchall()]


def scalar(db: duckdb.DuckDBPyConnection, sql: str, params: list[Any] | None = None) -> Any:
    row = db.execute(sql, params or []).fetchone()
    return row[0] if row else None


def category_id_for(db: duckdb.DuckDBPyConnection, name: str, group: str | None = None) -> int:
    existing = scalar(db, "SELECT id FROM categories WHERE lower(name) = lower(?)", [name])
    if existing is not None:
        return int(existing)
    lowered = f"{name} {group or ''}".lower()
    kind = "expense"
    if "transfer" in lowered or "credit card payment" in lowered:
        kind = "transfer"
    elif "income" in lowered or "paycheck" in lowered or "salary" in lowered:
        kind = "income"
    return int(
        scalar(
            db,
            "INSERT INTO categories (name, group_name, kind) VALUES (?, ?, ?) RETURNING id",
            [name, group, kind],
        )
    )
