"""Query-side Pydantic contracts (depends on answers.py only)."""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.answers import AnswerBlock, ViewSpec


class DateRange(BaseModel):
    start: datetime.date
    end: datetime.date


class Provenance(BaseModel):
    sql: str
    row_count: int
    date_range: DateRange | None = None
    last_synced_at: datetime.datetime | None = None
    result_id: str


class QueryResult(BaseModel):
    result_id: str
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    row_count: int
    truncated: bool = False
    provenance: Provenance


class AnalysisRecord(BaseModel):
    result_id: str
    question: str
    sql: str
    created_at: datetime.datetime
    row_count: int
    view_spec: ViewSpec | None = None


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    result_id: str | None = None


class SyncRequest(BaseModel):
    start: datetime.date | None = None
    end: datetime.date | None = None


class AnswerEnvelope(BaseModel):
    question: str
    blocks: list[AnswerBlock]
    provenance: Provenance
    result_id: str


class SyncResult(BaseModel):
    synced: bool
    transactions_written: int
    transactions_dropped: int
    date_range: DateRange
    last_synced_at: datetime.datetime
