"""Unit tests for ViewSpec validation + Vega-Lite compilation."""

from __future__ import annotations

import pytest

from app.models.answers import ChartType, Encoding, ViewSpec
from app.models.queries import Provenance, QueryResult
from app.visualization.compiler import compile_to_vega_lite
from app.visualization.validator import ViewSpecError, validate_view_spec

pytestmark = pytest.mark.unit


def _result(columns, rows):
    return QueryResult(
        result_id="r1",
        columns=columns,
        column_types=["VARCHAR"] * len(columns),
        rows=rows,
        row_count=len(rows),
        provenance=Provenance(sql="SELECT 1", row_count=len(rows), result_id="r1"),
    )


CATEGORICAL = _result(
    ["category", "total"],
    [["Rent", -1200.0], ["Groceries", -210.0], ["Dining", -78.0]],
)
TIMESERIES = _result(
    ["month", "spend"],
    [["2024-01", -1365.0], ["2024-02", -123.0]],
)


def test_bar_compiles():
    spec = ViewSpec(
        chart_type=ChartType.BAR,
        x=Encoding(field="category", type="nominal"),
        y=Encoding(field="total", type="quantitative"),
    )
    vega = compile_to_vega_lite(spec, CATEGORICAL)
    assert vega["mark"] == "bar"
    assert vega["encoding"]["x"]["field"] == "category"
    assert len(vega["data"]["values"]) == 3


def test_line_compiles():
    spec = ViewSpec(
        chart_type=ChartType.LINE,
        x=Encoding(field="month", type="temporal"),
        y=Encoding(field="spend", type="quantitative"),
    )
    vega = compile_to_vega_lite(spec, TIMESERIES)
    assert vega["mark"]["type"] == "line"


def test_metric_compiles_to_value():
    single = _result(["net"], [[3512.0]])
    spec = ViewSpec(chart_type=ChartType.METRIC, y=Encoding(field="net", type="quantitative"))
    vega = compile_to_vega_lite(spec, single)
    assert vega["mode"] == "metric"
    assert vega["value"] == 3512.0


def test_table_compiles_columns():
    spec = ViewSpec(chart_type=ChartType.TABLE)
    vega = compile_to_vega_lite(spec, CATEGORICAL)
    assert vega["mode"] == "table"
    assert vega["columns"] == ["category", "total"]


def test_donut_uses_theta_and_color():
    spec = ViewSpec(
        chart_type=ChartType.DONUT,
        color=Encoding(field="category", type="nominal"),
        y=Encoding(field="total", type="quantitative"),
    )
    vega = compile_to_vega_lite(spec, CATEGORICAL)
    assert vega["mark"]["type"] == "arc"
    assert "theta" in vega["encoding"]
    assert "color" in vega["encoding"]


def test_stacked_bar_sets_stack():
    grouped = _result(
        ["month", "amount", "category"],
        [["2024-01", -100.0, "Rent"], ["2024-01", -50.0, "Dining"]],
    )
    spec = ViewSpec(
        chart_type=ChartType.STACKED_BAR,
        x=Encoding(field="month", type="nominal"),
        y=Encoding(field="amount", type="quantitative"),
        color=Encoding(field="category", type="nominal"),
    )
    vega = compile_to_vega_lite(spec, grouped)
    assert vega["encoding"]["y"]["stack"] == "zero"


def test_validate_rejects_missing_field():
    spec = ViewSpec(
        chart_type=ChartType.BAR,
        x=Encoding(field="does_not_exist", type="nominal"),
        y=Encoding(field="total", type="quantitative"),
    )
    with pytest.raises(ViewSpecError):
        validate_view_spec(spec, CATEGORICAL)


def test_validate_rejects_grouped_bar_without_color():
    spec = ViewSpec(
        chart_type=ChartType.GROUPED_BAR,
        x=Encoding(field="category", type="nominal"),
        y=Encoding(field="total", type="quantitative"),
    )
    with pytest.raises(ViewSpecError):
        validate_view_spec(spec, CATEGORICAL)


def test_validate_rejects_line_with_non_quantitative_y():
    spec = ViewSpec(
        chart_type=ChartType.LINE,
        x=Encoding(field="month", type="temporal"),
        y=Encoding(field="spend", type="nominal"),
    )
    with pytest.raises(ViewSpecError):
        validate_view_spec(spec, TIMESERIES)
