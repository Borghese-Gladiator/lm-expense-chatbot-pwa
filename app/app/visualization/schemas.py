"""Chart-type encoding rules: required and allowed channels per chart type."""

from __future__ import annotations

from app.models.answers import ChartType


def supported_encodings() -> dict[ChartType, dict[str, object]]:
    """Return required/allowed channels and field-type rules per chart type.

    required: channels that must be present
    allowed: full set of channels this chart accepts
    color_required: whether the color channel is mandatory (grouped/stacked)
    """
    xy = ["x", "y"]
    xyc = ["x", "y", "color"]
    return {
        ChartType.METRIC: {"required": ["y"], "allowed": ["y"], "color_required": False},
        ChartType.TABLE: {"required": [], "allowed": [], "color_required": False},
        ChartType.LINE: {"required": xy, "allowed": xyc, "color_required": False},
        ChartType.BAR: {"required": xy, "allowed": xyc, "color_required": False},
        ChartType.GROUPED_BAR: {"required": xyc, "allowed": xyc, "color_required": True},
        ChartType.STACKED_BAR: {"required": xyc, "allowed": xyc, "color_required": True},
        ChartType.AREA: {"required": xy, "allowed": xyc, "color_required": False},
        ChartType.SCATTER: {"required": xy, "allowed": xyc, "color_required": False},
        ChartType.DONUT: {
            "required": ["color", "y"],
            "allowed": ["color", "y"],
            "color_required": True,
        },
    }
