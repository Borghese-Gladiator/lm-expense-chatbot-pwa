"""Semantic view definitions and refresh.

Views encode the sign rules and exclusion policy so the agent never has to:
- transactions_visible: all non-child (parent split rows dropped in favor of components)
- transaction_components: leaf-level rows (splits expanded, parents removed)
- transactions_included_in_totals: rows that count toward spend/income/net totals
  (excludes transfers, pending, and explicitly-excluded rows)
- budget_performance: budgeted vs actual by category/period
"""

from __future__ import annotations

import duckdb


def semantic_view_definitions() -> dict[str, str]:
    return {
        "transactions_visible": """
CREATE OR REPLACE VIEW analytics.transactions_visible AS
SELECT *
FROM analytics.transactions
WHERE parent_id IS NULL
""",
        "transaction_components": """
CREATE OR REPLACE VIEW analytics.transaction_components AS
SELECT t.*
FROM analytics.transactions t
WHERE t.id NOT IN (
    SELECT DISTINCT parent_id
    FROM analytics.transactions
    WHERE parent_id IS NOT NULL
)
""",
        "transactions_included_in_totals": """
CREATE OR REPLACE VIEW analytics.transactions_included_in_totals AS
SELECT *
FROM analytics.transaction_components
WHERE excluded_from_totals = FALSE
  AND is_transfer = FALSE
  AND is_pending = FALSE
""",
        "budget_performance": """
CREATE OR REPLACE VIEW analytics.budget_performance AS
SELECT
    category_id,
    category_name,
    period_start,
    budgeted,
    actual,
    (actual - budgeted) AS variance
FROM analytics.budgets
""",
    }


def refresh_views(db: duckdb.DuckDBPyConnection) -> None:
    for sql in semantic_view_definitions().values():
        db.execute(sql)
