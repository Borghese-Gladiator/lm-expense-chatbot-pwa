"""Golden query suite: >=25 questions mapped to expected result_shape / filters / view.

Each spec carries a *reference* read-only SQL that a correct analyst would produce (used
to exercise the real validation + registry + visualization pipeline deterministically),
plus the expected result shape, the filters the SQL must honor, and the expected chart type.
"""

from __future__ import annotations

from typing import Any

INCLUDED = "analytics.transactions_included_in_totals"

GOLDEN: list[dict[str, Any]] = [
    {
        "id": "net_cash_flow",
        "question": "What is my net cash flow?",
        "sql": f"SELECT SUM(base_amount) AS net FROM {INCLUDED}",
        "result_shape": "scalar",
        "filters": ["included_in_totals"],
        "view": "metric",
    },
    {
        "id": "total_income",
        "question": "How much income did I earn?",
        "sql": f"SELECT SUM(base_amount) AS income FROM {INCLUDED} WHERE is_income",
        "result_shape": "scalar",
        "filters": ["included_in_totals", "is_income"],
        "view": "metric",
    },
    {
        "id": "total_spend",
        "question": "How much did I spend in total?",
        "sql": f"SELECT SUM(base_amount) AS spend FROM {INCLUDED} WHERE NOT is_income",
        "result_shape": "scalar",
        "filters": ["included_in_totals", "expense_only"],
        "view": "metric",
    },
    {
        "id": "spend_by_category",
        "question": "How much did I spend by category?",
        "sql": (
            f"SELECT category_name, SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE NOT is_income GROUP BY category_name ORDER BY total"
        ),
        "result_shape": "category_series",
        "filters": ["included_in_totals", "expense_only", "group_by_category"],
        "view": "bar",
    },
    {
        "id": "spend_by_month",
        "question": "What is my monthly spend trend?",
        "sql": (
            f"SELECT strftime(date, '%Y-%m') AS month, SUM(base_amount) AS spend "
            f"FROM {INCLUDED} WHERE NOT is_income GROUP BY month ORDER BY month"
        ),
        "result_shape": "time_series",
        "filters": ["included_in_totals", "expense_only", "group_by_month"],
        "view": "line",
    },
    {
        "id": "income_by_month",
        "question": "Show my income by month",
        "sql": (
            f"SELECT strftime(date, '%Y-%m') AS month, SUM(base_amount) AS income "
            f"FROM {INCLUDED} WHERE is_income GROUP BY month ORDER BY month"
        ),
        "result_shape": "time_series",
        "filters": ["included_in_totals", "is_income", "group_by_month"],
        "view": "line",
    },
    {
        "id": "top_spend_category",
        "question": "What is my biggest spending category?",
        "sql": (
            f"SELECT category_name, SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE NOT is_income GROUP BY category_name ORDER BY total ASC LIMIT 1"
        ),
        "result_shape": "single_row",
        "filters": ["included_in_totals", "expense_only"],
        "view": "metric",
    },
    {
        "id": "spend_composition_donut",
        "question": "Show spending composition by category",
        "sql": (
            f"SELECT category_name, ABS(SUM(base_amount)) AS total FROM {INCLUDED} "
            "WHERE NOT is_income GROUP BY category_name"
        ),
        "result_shape": "category_series",
        "filters": ["included_in_totals", "expense_only", "group_by_category"],
        "view": "donut",
    },
    {
        "id": "groceries_total",
        "question": "How much did I spend on Groceries?",
        "sql": (
            f"SELECT SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE category_name = 'Groceries'"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "category_filter"],
        "view": "metric",
    },
    {
        "id": "dining_total",
        "question": "What did I spend on Dining?",
        "sql": (
            f"SELECT SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE category_name = 'Dining'"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "category_filter"],
        "view": "metric",
    },
    {
        "id": "transactions_over_100",
        "question": "Show transactions over 100 dollars",
        "sql": (
            f"SELECT date, category_name, base_amount FROM {INCLUDED} "
            "WHERE ABS(base_amount) > 100 ORDER BY date"
        ),
        "result_shape": "rows",
        "filters": ["included_in_totals", "amount_filter"],
        "view": "table",
    },
    {
        "id": "count_transactions",
        "question": "How many transactions count toward my totals?",
        "sql": f"SELECT COUNT(*) AS n FROM {INCLUDED}",
        "result_shape": "scalar",
        "filters": ["included_in_totals"],
        "view": "metric",
    },
    {
        "id": "avg_transaction",
        "question": "What is my average transaction amount?",
        "sql": f"SELECT AVG(base_amount) AS avg_amount FROM {INCLUDED}",
        "result_shape": "scalar",
        "filters": ["included_in_totals"],
        "view": "metric",
    },
    {
        "id": "spend_by_account",
        "question": "How much did I spend by account?",
        "sql": (
            f"SELECT account_key, SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE NOT is_income GROUP BY account_key ORDER BY total"
        ),
        "result_shape": "category_series",
        "filters": ["included_in_totals", "expense_only", "group_by_account"],
        "view": "bar",
    },
    {
        "id": "january_spend",
        "question": "How much did I spend in January?",
        "sql": (
            f"SELECT SUM(base_amount) AS spend FROM {INCLUDED} "
            "WHERE NOT is_income AND date BETWEEN DATE '2024-01-01' AND DATE '2024-01-31'"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "expense_only", "date_range"],
        "view": "metric",
    },
    {
        "id": "february_spend",
        "question": "How much did I spend in February?",
        "sql": (
            f"SELECT SUM(base_amount) AS spend FROM {INCLUDED} "
            "WHERE NOT is_income AND date BETWEEN DATE '2024-02-01' AND DATE '2024-02-29'"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "expense_only", "date_range"],
        "view": "metric",
    },
    {
        "id": "category_month_grouped",
        "question": "Show spend by category and month",
        "sql": (
            f"SELECT strftime(date, '%Y-%m') AS month, category_name, SUM(base_amount) AS total "
            f"FROM {INCLUDED} WHERE NOT is_income GROUP BY month, category_name ORDER BY month"
        ),
        "result_shape": "grouped_series",
        "filters": ["included_in_totals", "expense_only", "group_by_month_category"],
        "view": "grouped_bar",
    },
    {
        "id": "category_month_stacked",
        "question": "Show stacked spend by month and category",
        "sql": (
            f"SELECT strftime(date, '%Y-%m') AS month, category_name, "
            f"ABS(SUM(base_amount)) AS total "
            f"FROM {INCLUDED} WHERE NOT is_income GROUP BY month, category_name ORDER BY month"
        ),
        "result_shape": "grouped_series",
        "filters": ["included_in_totals", "expense_only", "group_by_month_category"],
        "view": "stacked_bar",
    },
    {
        "id": "cumulative_spend_area",
        "question": "Show cumulative spend over time",
        "sql": (
            f"SELECT date, SUM(SUM(base_amount)) OVER (ORDER BY date) AS cumulative "
            f"FROM {INCLUDED} WHERE NOT is_income GROUP BY date ORDER BY date"
        ),
        "result_shape": "time_series",
        "filters": ["included_in_totals", "expense_only"],
        "view": "area",
    },
    {
        "id": "amount_vs_date_scatter",
        "question": "Plot transaction amounts over time",
        "sql": (
            f"SELECT date, base_amount FROM {INCLUDED} WHERE NOT is_income ORDER BY date"
        ),
        "result_shape": "rows",
        "filters": ["included_in_totals", "expense_only"],
        "view": "scatter",
    },
    {
        "id": "list_categories",
        "question": "List my categories",
        "sql": "SELECT id, name FROM analytics.categories ORDER BY name",
        "result_shape": "rows",
        "filters": [],
        "view": "table",
    },
    {
        "id": "list_accounts",
        "question": "Show my accounts",
        "sql": "SELECT account_key, name, currency, balance FROM analytics.accounts",
        "result_shape": "rows",
        "filters": [],
        "view": "table",
    },
    {
        "id": "budget_variance",
        "question": "How am I tracking against budget?",
        "sql": (
            "SELECT category_name, budgeted, actual, variance "
            "FROM analytics.budget_performance ORDER BY variance"
        ),
        "result_shape": "rows",
        "filters": ["budget"],
        "view": "table",
    },
    {
        "id": "reimbursable_spend",
        "question": "How much of my spend is reimbursable?",
        "sql": (
            f"SELECT SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE list_contains(tags, 'reimbursable')"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "tag_filter"],
        "view": "metric",
    },
    {
        "id": "spend_excluding_rent",
        "question": "What did I spend excluding rent?",
        "sql": (
            f"SELECT SUM(base_amount) AS total FROM {INCLUDED} "
            "WHERE NOT is_income AND category_name <> 'Rent'"
        ),
        "result_shape": "scalar",
        "filters": ["included_in_totals", "expense_only", "category_exclude"],
        "view": "metric",
    },
    {
        "id": "largest_single_expense",
        "question": "What was my largest single expense?",
        "sql": (
            f"SELECT date, category_name, base_amount FROM {INCLUDED} "
            "WHERE NOT is_income ORDER BY base_amount ASC LIMIT 1"
        ),
        "result_shape": "single_row",
        "filters": ["included_in_totals", "expense_only"],
        "view": "table",
    },
    {
        "id": "monthly_net",
        "question": "What is my net by month?",
        "sql": (
            f"SELECT strftime(date, '%Y-%m') AS month, SUM(base_amount) AS net "
            f"FROM {INCLUDED} GROUP BY month ORDER BY month"
        ),
        "result_shape": "time_series",
        "filters": ["included_in_totals", "group_by_month"],
        "view": "bar",
    },
]


def golden_questions() -> list[dict[str, Any]]:
    return GOLDEN
