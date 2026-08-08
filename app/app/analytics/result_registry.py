"""In-process result registry + deterministic fact generation + date-range resolution."""

from __future__ import annotations

import datetime
import re
import uuid
from decimal import Decimal
from typing import Any

import duckdb

from app.analytics.query_validator import ValidationError, ValidatorLimits
from app.models.answers import Fact, ViewSpec
from app.models.queries import (
    AnalysisRecord,
    DateRange,
    Provenance,
    QueryResult,
)


def _coerce_cell(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


class ResultRegistry:
    def __init__(self, db: duckdb.DuckDBPyConnection, limits: ValidatorLimits) -> None:
        self._db = db
        self._limits = limits
        self._results: dict[str, QueryResult] = {}
        self._records: dict[str, AnalysisRecord] = {}
        self._inline_threshold = 100

    def run_query(
        self,
        sql: str,
        question: str,
        date_range: DateRange | None,
        last_synced_at: datetime.datetime | None,
    ) -> QueryResult:
        result_id = uuid.uuid4().hex
        try:
            cursor = self._db.execute(sql)
        except duckdb.Error as exc:
            raise ValidationError(f"query execution failed: {exc}") from None

        columns = [d[0] for d in cursor.description] if cursor.description else []
        column_types = [str(d[1]) for d in cursor.description] if cursor.description else []
        raw_rows = cursor.fetchall()

        truncated = len(raw_rows) > self._limits.max_rows
        if truncated:
            raw_rows = raw_rows[: self._limits.max_rows]

        rows = [[_coerce_cell(cell) for cell in row] for row in raw_rows]

        provenance = Provenance(
            sql=sql,
            row_count=len(rows),
            date_range=date_range,
            last_synced_at=last_synced_at,
            result_id=result_id,
        )
        result = QueryResult(
            result_id=result_id,
            columns=columns,
            column_types=column_types,
            rows=rows,
            row_count=len(rows),
            truncated=truncated,
            provenance=provenance,
        )
        self._results[result_id] = result
        self._records[result_id] = AnalysisRecord(
            result_id=result_id,
            question=question,
            sql=sql,
            created_at=datetime.datetime.now(datetime.timezone.utc),
            row_count=len(rows),
            view_spec=None,
        )
        return result

    def get(self, result_id: str) -> QueryResult:
        result = self._results.get(result_id)
        if result is None:
            raise KeyError(f"unknown result_id: {result_id}")
        if result.row_count <= self._inline_threshold:
            return result
        preview = result.model_copy(deep=True)
        preview.rows = preview.rows[: self._inline_threshold]
        preview.truncated = True
        return preview

    def get_full(self, result_id: str) -> QueryResult:
        result = self._results.get(result_id)
        if result is None:
            raise KeyError(f"unknown result_id: {result_id}")
        return result

    def get_rows(self, result_id: str, offset: int, limit: int) -> QueryResult:
        result = self.get_full(result_id)
        sliced = result.model_copy(deep=True)
        sliced.rows = result.rows[offset : offset + limit]
        sliced.truncated = offset + limit < result.row_count
        return sliced

    def record_view(self, result_id: str, view_spec: ViewSpec) -> None:
        record = self._records.get(result_id)
        if record is None:
            raise KeyError(f"unknown result_id: {result_id}")
        record.view_spec = view_spec

    def get_record(self, result_id: str) -> AnalysisRecord:
        record = self._records.get(result_id)
        if record is None:
            raise KeyError(f"unknown result_id: {result_id}")
        return record


def _is_numeric(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _format_number(value: float) -> str:
    if abs(value) >= 1000:
        return f"{value:,.2f}"
    return f"{value:.2f}"


def generate_facts(result: QueryResult, view_spec: ViewSpec | None) -> list[Fact]:
    """Deterministically derive grounded facts (row count, column totals, top row)."""
    facts: list[Fact] = [
        Fact(label="rows", value=str(result.row_count), raw_value=result.row_count, unit="rows")
    ]
    if not result.rows:
        return facts

    numeric_cols = [
        i
        for i in range(len(result.columns))
        if all(_is_numeric(row[i]) for row in result.rows)
    ]

    if result.row_count == 1 and len(numeric_cols) >= 1:
        for i in numeric_cols:
            val = float(result.rows[0][i])
            facts.append(
                Fact(
                    label=result.columns[i],
                    value=_format_number(val),
                    raw_value=val,
                )
            )
        return facts

    for i in numeric_cols:
        total = sum(float(row[i]) for row in result.rows)
        facts.append(
            Fact(
                label=f"total_{result.columns[i]}",
                value=_format_number(total),
                raw_value=total,
            )
        )

    if numeric_cols and len(result.columns) >= 2:
        metric_col = numeric_cols[-1]
        label_col = next((i for i in range(len(result.columns)) if i not in numeric_cols), 0)
        top_row = max(result.rows, key=lambda r: abs(float(r[metric_col])))
        facts.append(
            Fact(
                label="top",
                value=f"{top_row[label_col]} ({_format_number(float(top_row[metric_col]))})",
                raw_value=str(top_row[label_col]),
            )
        )
    return facts


_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _clamp(dr: DateRange, bounds: DateRange | None) -> DateRange:
    if bounds is None:
        return dr
    start = max(dr.start, bounds.start)
    end = min(dr.end, bounds.end)
    if start > end:
        return dr
    return DateRange(start=start, end=end)


def _month_range(year: int, month: int) -> DateRange:
    start = datetime.date(year, month, 1)
    if month == 12:
        end = datetime.date(year, 12, 31)
    else:
        end = datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)
    return DateRange(start=start, end=end)


def resolve_date_range(
    question: str,
    today: datetime.date,
    bounds: DateRange | None,
) -> DateRange | None:
    """Resolve relative phrases to a concrete window within data bounds."""
    q = question.lower()

    if "last month" in q:
        first_this = today.replace(day=1)
        last_month_end = first_this - datetime.timedelta(days=1)
        return _clamp(_month_range(last_month_end.year, last_month_end.month), bounds)

    if "this month" in q:
        return _clamp(_month_range(today.year, today.month), bounds)

    if "last year" in q:
        y = today.year - 1
        return _clamp(DateRange(start=datetime.date(y, 1, 1), end=datetime.date(y, 12, 31)), bounds)

    if "this year" in q or "year to date" in q or "ytd" in q:
        return _clamp(
            DateRange(start=datetime.date(today.year, 1, 1), end=today), bounds
        )

    m = re.search(r"last (\d+) days", q)
    if m:
        days = int(m.group(1))
        return _clamp(
            DateRange(start=today - datetime.timedelta(days=days), end=today), bounds
        )

    m = re.search(r"last (\d+) months", q)
    if m:
        months = int(m.group(1))
        start_month = today.month - months
        start_year = today.year
        while start_month <= 0:
            start_month += 12
            start_year -= 1
        return _clamp(
            DateRange(start=datetime.date(start_year, start_month, 1), end=today), bounds
        )

    for name, num in _MONTHS.items():
        if name in q:
            year = today.year
            ym = re.search(rf"{name}\s+(\d{{4}})", q)
            if ym:
                year = int(ym.group(1))
            return _clamp(_month_range(year, num), bounds)

    ym = re.search(r"\b(20\d{2})\b", q)
    if ym:
        year = int(ym.group(1))
        return _clamp(
            DateRange(start=datetime.date(year, 1, 1), end=datetime.date(year, 12, 31)), bounds
        )

    return None
