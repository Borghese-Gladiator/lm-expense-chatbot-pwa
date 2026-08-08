"""Answer-side Pydantic contracts (no dependency on queries.py)."""

from __future__ import annotations

import enum
from typing import Any, Literal

from pydantic import BaseModel


class Fact(BaseModel):
    label: str
    value: str
    raw_value: float | int | str | None = None
    unit: str | None = None


class ChartType(str, enum.Enum):
    METRIC = "metric"
    TABLE = "table"
    LINE = "line"
    BAR = "bar"
    GROUPED_BAR = "grouped_bar"
    STACKED_BAR = "stacked_bar"
    AREA = "area"
    SCATTER = "scatter"
    DONUT = "donut"


EncodingType = Literal["quantitative", "nominal", "temporal", "ordinal"]


class Encoding(BaseModel):
    field: str
    type: EncodingType
    aggregate: str | None = None


class ViewSpec(BaseModel):
    chart_type: ChartType
    x: Encoding | None = None
    y: Encoding | None = None
    color: Encoding | None = None
    title: str | None = None


class AnswerBlock(BaseModel):
    kind: Literal["insight", "metric", "table", "chart"]
    text: str | None = None
    facts: list[Fact] | None = None
    view_spec: ViewSpec | None = None
    vega_lite: dict[str, Any] | None = None
    result_id: str | None = None
