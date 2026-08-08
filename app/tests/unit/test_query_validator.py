"""Unit + security tests for the SQL validator."""

from __future__ import annotations

import pytest

from app.analytics.query_validator import ValidationError, ValidatorLimits, validate_sql

pytestmark = pytest.mark.unit

LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM analytics.transactions_included_in_totals",
        "SELECT category_name, SUM(base_amount) FROM analytics.transactions_included_in_totals "
        "GROUP BY category_name",
        "WITH x AS (SELECT * FROM transactions) SELECT * FROM x",
        "SELECT * FROM analytics.accounts JOIN analytics.transactions USING (account_key)",
        "SELECT * FROM transactions_included_in_totals ORDER BY date DESC LIMIT 5",
    ],
)
def test_accepts_read_only_queries(sql):
    safe = validate_sql(sql, LIMITS)
    assert "LIMIT" in safe.upper()


@pytest.mark.parametrize(
    "sql,fragment",
    [
        ("INSERT INTO analytics.transactions VALUES (1)", "read-only"),
        ("UPDATE analytics.transactions SET amount = 0", "read-only"),
        ("DELETE FROM analytics.transactions", "read-only"),
        ("DROP TABLE analytics.transactions", "read-only"),
        ("CREATE TABLE evil (x INT)", "read-only"),
        ("ALTER TABLE analytics.transactions ADD COLUMN x INT", "read-only"),
        ("TRUNCATE analytics.transactions", "read-only"),
    ],
)
def test_rejects_mutations_and_ddl(sql, fragment):
    with pytest.raises(ValidationError) as exc:
        validate_sql(sql, LIMITS)
    reason = str(exc.value).lower()
    assert (
        fragment in reason
        or "dangerous" in reason
        or "only select" in reason
    )


def test_rejects_multiple_statements():
    with pytest.raises(ValidationError) as exc:
        validate_sql("SELECT 1; SELECT 2", LIMITS)
    assert "multiple statements" in str(exc.value)


def test_rejects_stacked_mutation():
    with pytest.raises(ValidationError):
        validate_sql(
            "SELECT * FROM analytics.transactions; DROP TABLE analytics.transactions", LIMITS
        )


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM secret_table",
        "SELECT * FROM other_schema.transactions",
        "SELECT * FROM information_schema.tables",
    ],
)
def test_rejects_non_approved_schema(sql):
    with pytest.raises(ValidationError) as exc:
        validate_sql(sql, LIMITS)
    reason = str(exc.value).lower()
    assert "not approved" in reason


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM read_csv('/etc/passwd')",
        "SELECT * FROM read_parquet('s3://x/y')",
        "INSTALL httpfs",
        "LOAD httpfs",
        "COPY analytics.transactions TO '/tmp/out.csv'",
        "PRAGMA database_list",
        "ATTACH 'other.db' AS other",
        "SELECT * FROM glob('/**')",
    ],
)
def test_rejects_filesystem_and_network(sql):
    with pytest.raises(ValidationError):
        validate_sql(sql, LIMITS)


def test_injects_limit_when_absent():
    safe = validate_sql("SELECT * FROM analytics.transactions", LIMITS)
    assert f"LIMIT {LIMITS.max_rows}" in safe.upper() or "LIMIT 1000" in safe.upper()


def test_caps_oversized_limit():
    safe = validate_sql("SELECT * FROM analytics.transactions LIMIT 999999", LIMITS)
    assert "999999" not in safe


def test_empty_sql_rejected():
    with pytest.raises(ValidationError):
        validate_sql("   ", LIMITS)
