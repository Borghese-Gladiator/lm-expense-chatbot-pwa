"""Compile a validated ViewSpec + QueryResult into a Vega-Lite spec."""

from __future__ import annotations

from typing import Any

from app.models.answers import ChartType, Encoding, ViewSpec
from app.models.queries import QueryResult
from app.visualization.validator import validate_view_spec

_VEGA_SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json"

_MARK_BY_TYPE: dict[ChartType, Any] = {
    ChartType.LINE: {"type": "line", "point": True},
    ChartType.BAR: "bar",
    ChartType.GROUPED_BAR: "bar",
    ChartType.STACKED_BAR: "bar",
    ChartType.AREA: "area",
    ChartType.SCATTER: "point",
    ChartType.DONUT: {"type": "arc", "innerRadius": 60},
}


def _values_from_result(result: QueryResult) -> list[dict[str, Any]]:
    return [dict(zip(result.columns, row, strict=False)) for row in result.rows]


def _compile_encoding(encoding: Encoding) -> dict[str, Any]:
    channel: dict[str, Any] = {"field": encoding.field, "type": encoding.type}
    if encoding.aggregate:
        channel["aggregate"] = encoding.aggregate
    return channel


def compile_to_vega_lite(view_spec: ViewSpec, result: QueryResult) -> dict[str, Any]:
    validate_view_spec(view_spec, result)

    if view_spec.chart_type in (ChartType.METRIC, ChartType.TABLE):
        return _compile_non_graphical(view_spec, result)

    values = _values_from_result(result)
    encoding: dict[str, Any] = {}

    if view_spec.chart_type is ChartType.DONUT:
        if view_spec.y is not None:
            encoding["theta"] = _compile_encoding(view_spec.y)
        if view_spec.color is not None:
            encoding["color"] = _compile_encoding(view_spec.color)
    else:
        if view_spec.x is not None:
            encoding["x"] = _compile_encoding(view_spec.x)
        if view_spec.y is not None:
            encoding["y"] = _compile_encoding(view_spec.y)
        if view_spec.color is not None:
            encoding["color"] = _compile_encoding(view_spec.color)

    if view_spec.chart_type is ChartType.GROUPED_BAR and view_spec.x is not None:
        encoding["xOffset"] = {"field": view_spec.color.field} if view_spec.color else {}
    if view_spec.chart_type is ChartType.STACKED_BAR and view_spec.y is not None:
        encoding["y"] = {**encoding.get("y", {}), "stack": "zero"}

    spec: dict[str, Any] = {
        "$schema": _VEGA_SCHEMA,
        "data": {"values": values},
        "mark": _MARK_BY_TYPE[view_spec.chart_type],
        "encoding": encoding,
    }
    if view_spec.title:
        spec["title"] = view_spec.title
    return spec


def _compile_non_graphical(view_spec: ViewSpec, result: QueryResult) -> dict[str, Any]:
    if view_spec.chart_type is ChartType.METRIC:
        value: Any = None
        if view_spec.y is not None and result.rows:
            col_idx = result.columns.index(view_spec.y.field)
            value = result.rows[0][col_idx]
        return {
            "$schema": _VEGA_SCHEMA,
            "mode": "metric",
            "title": view_spec.title,
            "value": value,
            "field": view_spec.y.field if view_spec.y else None,
        }
    return {
        "$schema": _VEGA_SCHEMA,
        "mode": "table",
        "title": view_spec.title,
        "columns": result.columns,
        "values": _values_from_result(result),
    }
