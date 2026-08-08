"""Security-rejection tests at the agent-tool layer.

query_finance must reject dangerous SQL and NEVER execute it (no result_id, no rows,
no mutation of the database).
"""

from __future__ import annotations

import duckdb
import pytest

from app.agent.tools import create_view, query_finance
from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.lunchmoney.sync import seed_reference
from tests.fixtures.reference_dataset import ACCOUNTS, BUDGETS, CATEGORIES, reference_dataset

pytestmark = pytest.mark.integration

LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)


@pytest.fixture
def registry() -> ResultRegistry:
    conn = duckdb.connect(":memory:")
    init_schema(conn)
    txns, _ = reference_dataset()
    seed_reference(conn, txns, ACCOUNTS, CATEGORIES, BUDGETS)
    return ResultRegistry(conn, LIMITS)


DANGEROUS = [
    "INSERT INTO analytics.transactions VALUES (1)",
    "UPDATE analytics.transactions SET amount = 0",
    "DELETE FROM analytics.transactions",
    "DROP TABLE analytics.transactions",
    "CREATE TABLE evil (x INT)",
    "ALTER TABLE analytics.transactions ADD COLUMN x INT",
    "SELECT * FROM analytics.transactions; DROP TABLE analytics.transactions",
    "SELECT 1; SELECT 2",
    "SELECT * FROM secret_table",
    "SELECT * FROM information_schema.tables",
    "SELECT * FROM read_csv('/etc/passwd')",
    "SELECT * FROM read_parquet('s3://x')",
    "INSTALL httpfs",
    "LOAD httpfs",
    "COPY analytics.transactions TO '/tmp/x.csv'",
    "PRAGMA database_list",
    "ATTACH 'other.db' AS o",
]


@pytest.mark.parametrize("sql", DANGEROUS)
def test_query_finance_rejects_dangerous_sql(registry: ResultRegistry, sql: str):
    before = registry._db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    result = query_finance(registry, LIMITS, sql, "q", None)
    assert result["error"] == "rejected"
    assert "reason" in result
    assert "result_id" not in result
    after = registry._db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    assert before == after  # database unchanged


def test_limit_breach_is_capped_not_executed_unbounded(registry: ResultRegistry):
    result = query_finance(
        registry, LIMITS, "SELECT * FROM analytics.transactions LIMIT 999999", "q", None
    )
    assert "result_id" in result
    assert result["row_count"] <= LIMITS.max_rows


def test_create_view_rejects_unknown_result_id(registry: ResultRegistry):
    result = create_view(registry, "does-not-exist", {"chart_type": "table"})
    assert result["error"] == "unknown_result_id"


def test_create_view_rejects_invalid_field(registry: ResultRegistry):
    good = query_finance(
        registry, LIMITS,
        "SELECT category_name, SUM(base_amount) AS total "
        "FROM analytics.transactions_included_in_totals GROUP BY category_name",
        "q", None,
    )
    rid = good["result_id"]
    bad_spec = {
        "chart_type": "bar",
        "x": {"field": "nonexistent", "type": "nominal"},
        "y": {"field": "total", "type": "quantitative"},
    }
    result = create_view(registry, rid, bad_spec)
    assert result["error"] == "invalid_view_spec"
