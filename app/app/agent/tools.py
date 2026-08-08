"""The three restricted analyst tools + their Anthropic tool-use schemas."""

from __future__ import annotations

import datetime
from typing import Any, TypedDict

import duckdb

from app.agent.catalog import build_catalog
from app.analytics.query_validator import ValidationError, ValidatorLimits, validate_sql
from app.analytics.result_registry import ResultRegistry, generate_facts
from app.models.answers import ViewSpec
from app.models.queries import DateRange
from app.visualization.compiler import compile_to_vega_lite
from app.visualization.validator import ViewSpecError


class ToolSpec(TypedDict):
    name: str
    description: str
    input_schema: dict[str, Any]


def tool_specs() -> list[ToolSpec]:
    return [
        {
            "name": "get_finance_catalog",
            "description": (
                "Return the approved read-only finance catalog: tables/views, their columns, "
                "sign rules, base currency, and data date bounds. Call this first."
            ),
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "query_finance",
            "description": (
                "Run a single READ-ONLY SQL query (SELECT/WITH only) against the approved "
                "analytics tables/views. Returns result_id, columns, a preview of rows, and "
                "deterministic facts. Rejected if the SQL is not read-only, references "
                "non-approved objects, or uses filesystem/network functions."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Read-only SQL query."},
                },
                "required": ["sql"],
            },
        },
        {
            "name": "create_view",
            "description": (
                "Attach a chart specification to an existing result_id and compile it to "
                "Vega-Lite. Reuse a prior result_id (e.g. for 'show as a table') instead of "
                "re-querying."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "result_id": {"type": "string"},
                    "view_spec": {
                        "type": "object",
                        "properties": {
                            "chart_type": {
                                "type": "string",
                                "enum": [
                                    "metric", "table", "line", "bar", "grouped_bar",
                                    "stacked_bar", "area", "scatter", "donut",
                                ],
                            },
                            "x": {"$ref": "#/$defs/encoding"},
                            "y": {"$ref": "#/$defs/encoding"},
                            "color": {"$ref": "#/$defs/encoding"},
                            "title": {"type": "string"},
                        },
                        "required": ["chart_type"],
                        "$defs": {
                            "encoding": {
                                "type": "object",
                                "properties": {
                                    "field": {"type": "string"},
                                    "type": {
                                        "type": "string",
                                        "enum": [
                                            "quantitative", "nominal", "temporal", "ordinal",
                                        ],
                                    },
                                    "aggregate": {"type": "string"},
                                },
                                "required": ["field", "type"],
                            }
                        },
                    },
                },
                "required": ["result_id", "view_spec"],
            },
        },
    ]


def get_finance_catalog(
    db: duckdb.DuckDBPyConnection,
    base_currency: str,
    last_synced_at: datetime.datetime | None,
) -> dict[str, Any]:
    return build_catalog(db, base_currency, last_synced_at).model_dump(mode="json")


def query_finance(
    registry: ResultRegistry,
    limits: ValidatorLimits,
    sql: str,
    question: str,
    date_range: DateRange | None,
    last_synced_at: datetime.datetime | None = None,
) -> dict[str, Any]:
    try:
        safe_sql = validate_sql(sql, limits)
    except ValidationError as exc:
        return {"error": "rejected", "reason": exc.reason}

    try:
        result = registry.run_query(safe_sql, question, date_range, last_synced_at)
    except ValidationError as exc:
        return {"error": "rejected", "reason": exc.reason}

    facts = generate_facts(result, None)
    preview = result.rows[:20]
    return {
        "result_id": result.result_id,
        "columns": result.columns,
        "column_types": result.column_types,
        "preview_rows": preview,
        "row_count": result.row_count,
        "truncated": result.truncated,
        "facts": [f.model_dump() for f in facts],
    }


def create_view(
    registry: ResultRegistry,
    result_id: str,
    view_spec: dict[str, Any],
) -> dict[str, Any]:
    try:
        result = registry.get_full(result_id)
    except KeyError:
        return {"error": "unknown_result_id", "reason": f"no such result_id: {result_id}"}

    try:
        spec = ViewSpec.model_validate(view_spec)
    except Exception as exc:  # noqa: BLE001
        return {"error": "invalid_view_spec", "reason": str(exc)}

    try:
        vega = compile_to_vega_lite(spec, result)
    except ViewSpecError as exc:
        return {"error": "invalid_view_spec", "reason": exc.reason}

    registry.record_view(result_id, spec)
    return {
        "result_id": result_id,
        "view_spec": spec.model_dump(mode="json"),
        "vega_lite": vega,
    }
