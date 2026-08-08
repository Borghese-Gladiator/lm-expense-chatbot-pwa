"""Unit tests for the result registry + deterministic fact generation."""

from __future__ import annotations

import pytest

from app.analytics.result_registry import ResultRegistry, generate_facts
from app.models.answers import ChartType, ViewSpec

pytestmark = pytest.mark.unit


def _run(registry: ResultRegistry, sql: str):
    return registry.run_query(sql, "q", None, None)


def test_run_query_returns_result_id_and_rows(registry: ResultRegistry):
    result = _run(
        registry,
        "SELECT category_name, SUM(base_amount) AS total "
        "FROM analytics.transactions_included_in_totals WHERE NOT is_income "
        "GROUP BY category_name",
    )
    assert result.result_id
    assert "category_name" in result.columns
    assert result.row_count == 3


def test_get_reuses_stored_result(registry: ResultRegistry):
    result = _run(registry, "SELECT * FROM analytics.transactions_included_in_totals")
    again = registry.get(result.result_id)
    assert again.result_id == result.result_id


def test_get_unknown_raises(registry: ResultRegistry):
    with pytest.raises(KeyError):
        registry.get("nope")


def test_inline_small_vs_preview_large(seeded_db, limits):
    registry = ResultRegistry(seeded_db, limits)
    registry._inline_threshold = 3
    result = _run(registry, "SELECT * FROM analytics.transactions")
    assert result.row_count == 10
    preview = registry.get(result.result_id)
    assert len(preview.rows) == 3
    assert preview.truncated is True
    full = registry.get_full(result.result_id)
    assert len(full.rows) == 10


def test_get_rows_paging(registry: ResultRegistry):
    result = _run(registry, "SELECT * FROM analytics.transactions ORDER BY id")
    page = registry.get_rows(result.result_id, offset=2, limit=3)
    assert len(page.rows) == 3
    assert page.rows[0][0] == 3  # id column, ordered


def test_record_view_attaches_spec(registry: ResultRegistry):
    result = _run(registry, "SELECT name FROM analytics.categories")
    spec = ViewSpec(chart_type=ChartType.TABLE)
    registry.record_view(result.result_id, spec)
    assert registry.get_record(result.result_id).view_spec == spec


def test_facts_single_row_metric(registry: ResultRegistry):
    result = _run(
        registry,
        "SELECT SUM(base_amount) AS net FROM analytics.transactions_included_in_totals",
    )
    facts = generate_facts(result, None)
    labels = {f.label for f in facts}
    assert "net" in labels
    net_fact = next(f for f in facts if f.label == "net")
    assert net_fact.raw_value == 3512.0


def test_facts_totals_and_top(registry: ResultRegistry):
    result = _run(
        registry,
        "SELECT category_name, SUM(base_amount) AS total "
        "FROM analytics.transactions_included_in_totals WHERE NOT is_income "
        "GROUP BY category_name ORDER BY total",
    )
    facts = generate_facts(result, None)
    labels = {f.label for f in facts}
    assert "rows" in labels
    assert any(lbl.startswith("total_") for lbl in labels)
    assert "top" in labels
