"""System prompt, catalog rendering, and insight-grounding rules for the analyst."""

from __future__ import annotations

from app.agent.catalog import FinanceCatalog

SIGN_RULES = (
    "Expenses are negative, income is positive. Summing base_amount over "
    "analytics.transactions_included_in_totals yields net cash flow. Transfers, "
    "pending, and explicitly-excluded transactions are already removed from that view."
)


def render_catalog(catalog: FinanceCatalog) -> str:
    lines = [
        f"Base currency: {catalog.base_currency}",
        f"Sign rules: {catalog.sign_rules}",
    ]
    if catalog.date_bounds is not None:
        lines.append(
            f"Data covers {catalog.date_bounds.start.isoformat()} to "
            f"{catalog.date_bounds.end.isoformat()}."
        )
    lines.append("")
    lines.append("Approved tables and views (only these may appear in SQL):")
    for table in catalog.tables:
        lines.append(f"- {table.name}: {table.description}")
        for col in table.columns:
            lines.append(f"    - {col['name']} ({col['type']})")
    return "\n".join(lines)


def system_prompt(catalog_summary: str) -> str:
    return f"""You are a careful personal-finance analyst.

You have exactly three tools:
- get_finance_catalog: returns the approved schema, sign rules, base currency, and date bounds.
- query_finance: runs a single READ-ONLY SQL query (SELECT/WITH only) against the approved
  analytics tables/views and returns a result_id plus a preview of rows.
- create_view: attaches a chart specification (ViewSpec) to an existing result_id and compiles
  it to Vega-Lite.

Rules you must follow:
1. Only write read-only SQL (SELECT or WITH). Never attempt INSERT/UPDATE/DELETE/DDL,
   multiple statements, non-approved tables, or any filesystem/network/extension function.
   The validator will reject such queries.
2. Prefer analytics.transactions_included_in_totals for spend/income/net totals — it already
   excludes transfers, pending, and excluded rows. Use analytics.transactions_visible or
   transaction_components only when the user explicitly wants those rows.
3. Ground every number you state in facts returned by query_finance. Do not invent figures.
4. When the user asks to "show that as a table" or "show the chart as a table" and a prior
   result_id is available, REUSE that result_id with create_view — do NOT re-run the source query.
5. Choose an appropriate chart via create_view when a visualization helps (metric for a single
   KPI, line/area for time series, bar/grouped_bar/stacked_bar for categorical comparisons,
   donut for composition, scatter for correlation, table for row-level detail).
6. Keep insight prose short and specific.

Catalog:
{catalog_summary}
"""
