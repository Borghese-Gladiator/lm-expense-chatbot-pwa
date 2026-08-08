"""Parametrized golden-query assertions over the reference dataset.

For each golden spec we:
- validate the reference SQL through the hard validator (must pass, single read-only stmt)
- execute it via the registry and assert the returned result_shape
- build the expected ViewSpec and compile it to Vega-Lite (must validate + compile)
"""

from __future__ import annotations

import pytest

from app.analytics.query_validator import validate_sql
from app.analytics.result_registry import ResultRegistry, generate_facts
from app.models.answers import ChartType, Encoding, ViewSpec
from app.models.queries import QueryResult
from app.visualization.compiler import compile_to_vega_lite
from tests.golden.golden_questions import golden_questions

pytestmark = pytest.mark.integration

GOLDEN = golden_questions()


def test_at_least_25_golden_questions():
    assert len(GOLDEN) >= 25


def _assert_shape(result: QueryResult, shape: str) -> None:
    if shape == "scalar":
        assert result.row_count == 1
        assert len(result.columns) == 1
    elif shape == "single_row":
        assert result.row_count <= 1
    elif shape in ("category_series", "time_series"):
        assert len(result.columns) == 2
        assert result.row_count >= 1
    elif shape == "grouped_series":
        assert len(result.columns) == 3
    elif shape == "rows":
        assert result.row_count >= 0
    else:
        raise AssertionError(f"unknown shape: {shape}")


def _view_for(spec: dict, result: QueryResult) -> ViewSpec:
    view = spec["view"]
    cols = result.columns
    if view == "metric":
        return ViewSpec(chart_type=ChartType.METRIC,
                        y=Encoding(field=cols[-1], type="quantitative"))
    if view == "table":
        return ViewSpec(chart_type=ChartType.TABLE)
    if view in ("bar", "line", "area", "scatter"):
        return ViewSpec(
            chart_type=ChartType(view),
            x=Encoding(field=cols[0], type="nominal" if view != "line" else "temporal"),
            y=Encoding(field=cols[1], type="quantitative"),
        )
    if view == "donut":
        return ViewSpec(
            chart_type=ChartType.DONUT,
            color=Encoding(field=cols[0], type="nominal"),
            y=Encoding(field=cols[1], type="quantitative"),
        )
    if view in ("grouped_bar", "stacked_bar"):
        return ViewSpec(
            chart_type=ChartType(view),
            x=Encoding(field=cols[0], type="nominal"),
            y=Encoding(field=cols[2], type="quantitative"),
            color=Encoding(field=cols[1], type="nominal"),
        )
    raise AssertionError(f"unmapped view: {view}")


@pytest.mark.parametrize("spec", GOLDEN, ids=[g["id"] for g in GOLDEN])
def test_golden_query(spec, seeded_db, limits):
    safe_sql = validate_sql(spec["sql"], limits)
    registry = ResultRegistry(seeded_db, limits)
    result = registry.run_query(safe_sql, spec["question"], None, None)

    _assert_shape(result, spec["result_shape"])

    view = _view_for(spec, result)
    assert view.chart_type.value == spec["view"]
    vega = compile_to_vega_lite(view, result)
    assert vega is not None

    facts = generate_facts(result, view)
    assert facts  # always at least a row-count fact


def test_golden_filters_reference_approved_views_only(limits):
    for spec in GOLDEN:
        # every reference SQL must survive the validator
        validate_sql(spec["sql"], limits)
