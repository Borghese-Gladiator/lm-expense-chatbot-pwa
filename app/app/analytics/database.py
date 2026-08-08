"""DuckDB connection management and base + staging schema DDL."""

from __future__ import annotations

import duckdb

from app.analytics.semantic_views import refresh_views

BASE_TABLES_DDL = """
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.accounts (
    account_key VARCHAR PRIMARY KEY,
    source VARCHAR,
    source_id BIGINT,
    name VARCHAR,
    currency VARCHAR,
    balance DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS analytics.transactions (
    id BIGINT PRIMARY KEY,
    date DATE,
    account_key VARCHAR,
    amount DECIMAL(18,2),
    base_amount DECIMAL(18,2),
    currency VARCHAR,
    payee VARCHAR,
    category_id BIGINT,
    category_name VARCHAR,
    tags VARCHAR[],
    is_transfer BOOLEAN,
    is_pending BOOLEAN,
    is_income BOOLEAN,
    excluded_from_totals BOOLEAN,
    parent_id BIGINT
);

CREATE TABLE IF NOT EXISTS analytics.categories (
    id BIGINT PRIMARY KEY,
    name VARCHAR
);

CREATE TABLE IF NOT EXISTS analytics.budgets (
    category_id BIGINT,
    category_name VARCHAR,
    period_start DATE,
    budgeted DECIMAL(18,2),
    actual DECIMAL(18,2)
);
"""

STAGING_DDL = """
CREATE SCHEMA IF NOT EXISTS staging;

CREATE OR REPLACE TABLE staging.transactions (
    id BIGINT,
    date DATE,
    account_key VARCHAR,
    amount DECIMAL(18,2),
    base_amount DECIMAL(18,2),
    currency VARCHAR,
    payee VARCHAR,
    category_id BIGINT,
    category_name VARCHAR,
    tags VARCHAR[],
    is_transfer BOOLEAN,
    is_pending BOOLEAN,
    is_income BOOLEAN,
    excluded_from_totals BOOLEAN,
    parent_id BIGINT
);

CREATE OR REPLACE TABLE staging.accounts (
    account_key VARCHAR,
    source VARCHAR,
    source_id BIGINT,
    name VARCHAR,
    currency VARCHAR,
    balance DECIMAL(18,2)
);
"""


def get_connection(duckdb_path: str) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(duckdb_path)
    init_schema(conn)
    return conn


def init_schema(db: duckdb.DuckDBPyConnection) -> None:
    db.execute(BASE_TABLES_DDL)
    db.execute(STAGING_DDL)
    refresh_views(db)
