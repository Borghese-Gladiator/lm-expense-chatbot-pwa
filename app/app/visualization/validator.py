"""ViewSpec validation: field existence + chart-type/channel compatibility."""

from __future__ import annotations

from app.models.answers import ChartType, Encoding, ViewSpec
from app.models.queries import QueryResult
from app.visualization.schemas import supported_encodings


class ViewSpecError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


_QUANTITATIVE_TYPES = {"quantitative"}


def _channel(view_spec: ViewSpec, name: str) -> Encoding | None:
    return getattr(view_spec, name)


def validate_view_spec(view_spec: ViewSpec, result: QueryResult) -> None:
    rules = supported_encodings()[view_spec.chart_type]
    required: list[str] = rules["required"]  # type: ignore[assignment]
    allowed: list[str] = rules["allowed"]  # type: ignore[assignment]

    if view_spec.chart_type is ChartType.TABLE:
        return

    for channel in ("x", "y", "color"):
        enc = _channel(view_spec, channel)
        if enc is None:
            continue
        if channel not in allowed:
            raise ViewSpecError(
                f"{view_spec.chart_type.value} does not accept channel '{channel}'"
            )
        if enc.field not in result.columns:
            raise ViewSpecError(
                f"field '{enc.field}' not present in result columns {result.columns}"
            )

    for channel in required:
        if _channel(view_spec, channel) is None:
            raise ViewSpecError(
                f"{view_spec.chart_type.value} requires channel '{channel}'"
            )

    if view_spec.chart_type is ChartType.METRIC:
        y = view_spec.y
        if y is not None and y.type not in _QUANTITATIVE_TYPES:
            raise ViewSpecError("metric requires a quantitative y field")

    if view_spec.chart_type in (ChartType.LINE, ChartType.AREA):
        y = view_spec.y
        if y is not None and y.type not in _QUANTITATIVE_TYPES:
            raise ViewSpecError(
                f"{view_spec.chart_type.value} requires a quantitative y field"
            )
