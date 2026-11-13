"""Structured analytics query -> parameterized SQL over the `reportable` view.

Semantics (PRD section 8):
- amount < 0 is money out. `spending` flips the sign, so a refund (positive expense) reduces it.
- Transfers and adjustments never count toward spending, income or net.
- Pending rows and categories flagged exclude_from_totals are left out unless asked.
- `reportable` only holds leaf rows, so a split parent never counts next to its children.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any, Literal

import duckdb
from pydantic import BaseModel, Field, model_validator

from app.db import rows

Measure = Literal["spending", "income", "net"]
Metric = Literal["total", "count", "avg", "median", "pct_of_total", "cumulative"]
Dimension = Literal[
    "day",
    "week",
    "month",
    "quarter",
    "year",
    "category",
    "category_group",
    "merchant",
    "account",
    "tag",
    "type",
    "day_of_week",
    "weekend",
]
Compare = Literal["none", "previous_period", "same_period_last_year", "custom"]

TIME_DIMS = {"day", "week", "month", "quarter", "year"}

DIM_SQL: dict[str, str] = {
    "day": "date",
    "week": "CAST(date_trunc('week', date) AS DATE)",
    "month": "CAST(date_trunc('month', date) AS DATE)",
    "quarter": "CAST(date_trunc('quarter', date) AS DATE)",
    "year": "CAST(date_trunc('year', date) AS DATE)",
    "category": "category",
    "category_group": "category_group",
    "merchant": "merchant",
    "account": "account",
    "tag": "tag",
    "type": "txn_type",
    "day_of_week": "strftime(date, '%u %a')",
    "weekend": "CASE WHEN isodow(date) IN (6, 7) THEN 'Weekend' ELSE 'Weekday' END",
}

MEASURES: dict[str, tuple[list[str], str]] = {
    "spending": (["expense"], "-amount"),
    "income": (["income"], "amount"),
    "net": (["income", "expense"], "amount"),
}


class Filters(BaseModel):
    start: datetime.date | None = None
    end: datetime.date | None = None
    account_ids: list[int] = []
    category_ids: list[int] = []
    category_groups: list[str] = []
    merchants: list[str] = []
    tags: list[str] = []
    types: list[str] = []
    amount_min: float | None = None
    amount_max: float | None = None
    search: str | None = None
    include_pending: bool = False
    include_excluded_categories: bool = False
    exclude_ids: list[int] = []


class AnalyticsQuery(BaseModel):
    measure: Measure = "spending"
    metric: Metric = "total"
    dimensions: list[Dimension] = Field(default=[], max_length=2)
    filters: Filters = Filters()
    compare: Compare = "none"
    compare_start: datetime.date | None = None
    compare_end: datetime.date | None = None
    sort: Literal["value_desc", "value_asc", "dimension"] = "value_desc"
    limit: int = Field(default=100, ge=1, le=5000)
    chart: Literal["auto", "bar", "line", "area", "stacked_bar", "treemap", "table"] = "auto"

    @model_validator(mode="after")
    def _check(self) -> AnalyticsQuery:
        if len(set(self.dimensions)) != len(self.dimensions):
            raise ValueError("dimensions must be different")
        if self.metric == "cumulative" and (not self.dimensions or self.dimensions[0] not in TIME_DIMS):
            raise ValueError("cumulative needs a time dimension first")
        if self.compare != "none":
            if self.filters.start is None or self.filters.end is None:
                raise ValueError("compare needs filters.start and filters.end")
            if any(d in TIME_DIMS for d in self.dimensions):
                raise ValueError("compare does not support time dimensions")
            if self.metric in ("pct_of_total", "cumulative"):
                raise ValueError("compare supports total, count, avg and median")
            if self.compare == "custom" and (self.compare_start is None or self.compare_end is None):
                raise ValueError("custom compare needs compare_start and compare_end")
        return self


def where_clause(f: Filters, measure: Measure | None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    def any_of(column: str, values: list[Any]) -> None:
        clauses.append(f"{column} IN ({', '.join('?' * len(values))})")
        params.extend(values)

    if measure is not None:
        any_of("txn_type", MEASURES[measure][0])
        if not f.include_excluded_categories:
            clauses.append("NOT category_excluded")
    if not f.include_pending:
        clauses.append("NOT is_pending")
    if f.start:
        clauses.append("date >= ?")
        params.append(f.start)
    if f.end:
        clauses.append("date <= ?")
        params.append(f.end)
    if f.account_ids:
        any_of("account_id", f.account_ids)
    if f.category_ids:
        any_of("category_id", f.category_ids)
    if f.category_groups:
        any_of("category_group", f.category_groups)
    if f.merchants:
        any_of("merchant", f.merchants)
    if f.types:
        any_of("txn_type", f.types)
    if f.tags:
        clauses.append("list_has_any(tags, ?)")
        params.append(f.tags)
    if f.amount_min is not None:
        clauses.append("abs(amount) >= ?")
        params.append(f.amount_min)
    if f.amount_max is not None:
        clauses.append("abs(amount) <= ?")
        params.append(f.amount_max)
    if f.search:
        clauses.append("(payee_raw ILIKE ? OR merchant ILIKE ? OR notes ILIKE ?)")
        params.extend([f"%{f.search}%"] * 3)
    if f.exclude_ids:
        clauses.append(f"id NOT IN ({', '.join('?' * len(f.exclude_ids))})")
        params.extend(f.exclude_ids)
    return (" AND ".join(clauses) or "TRUE"), params


def _source(dimensions: list[Dimension]) -> str:
    if "tag" in dimensions:
        return (
            "(SELECT *, unnest(CASE WHEN len(tags) = 0 THEN ['(untagged)'] ELSE tags END)"
            " AS tag FROM reportable)"
        )
    return "reportable"


def _aggregate_sql(q: AnalyticsQuery, f: Filters) -> tuple[str, list[Any]]:
    where, params = where_clause(f, q.measure)
    value = MEASURES[q.measure][1]
    dims = [DIM_SQL[d] for d in q.dimensions]
    select_dims = [f"{expr} AS d{i}" for i, expr in enumerate(dims)]
    group = f"GROUP BY {', '.join(f'd{i}' for i in range(len(dims)))}" if dims else ""

    agg = {
        "total": f"SUM({value})",
        "count": "COUNT(*)",
        "avg": f"AVG({value})",
        "median": f"MEDIAN({value})",
        "pct_of_total": f"SUM({value})",
        "cumulative": f"SUM({value})",
    }[q.metric]

    inner = (
        f"SELECT {', '.join(select_dims + [f'{agg} AS value', 'COUNT(*) AS n'])} "
        f"FROM {_source(q.dimensions)} WHERE {where} {group}"
    )
    partition = "PARTITION BY d1" if len(dims) == 2 else ""
    outer_value = "value"
    if q.metric == "pct_of_total":
        share_partition = "PARTITION BY d0" if len(dims) == 2 else ""
        outer_value = f"value / NULLIF(SUM(value) OVER ({share_partition}), 0) * 100"
    elif q.metric == "cumulative":
        outer_value = f"SUM(value) OVER ({partition} ORDER BY d0)"

    order = {
        "value_desc": "value DESC NULLS LAST",
        "value_asc": "value ASC NULLS LAST",
        "dimension": ", ".join(f"d{i}" for i in range(len(dims))) or "value",
    }[q.sort]
    if dims and dims[0] in (DIM_SQL[t] for t in TIME_DIMS):
        order = ", ".join(f"d{i}" for i in range(len(dims)))
    if q.metric == "cumulative":
        order = ", ".join(f"d{i}" for i in range(len(dims)))

    out_dims = [f"d{i}" for i in range(len(dims))]
    sql = (
        f"SELECT {', '.join(out_dims + [f'{outer_value} AS value', 'n'])} "
        f"FROM ({inner}) ORDER BY {order} LIMIT {q.limit}"
    )
    return sql, params


def _plain(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime.date):
        return v.isoformat()
    return v


def _shift_year(d: datetime.date, years: int) -> datetime.date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def comparison_range(q: AnalyticsQuery) -> tuple[datetime.date, datetime.date]:
    start, end = q.filters.start, q.filters.end
    assert start is not None and end is not None
    if q.compare == "custom":
        assert q.compare_start is not None and q.compare_end is not None
        return q.compare_start, q.compare_end
    if q.compare == "same_period_last_year":
        return _shift_year(start, -1), _shift_year(end, -1)
    prev_end = start - datetime.timedelta(days=1)
    next_day = end + datetime.timedelta(days=1)
    if start.day == 1 and next_day.day == 1:
        months = (end.year - start.year) * 12 + end.month - start.month + 1
        first = start.year * 12 + start.month - 1 - months
        return datetime.date(first // 12, first % 12 + 1, 1), prev_end
    return prev_end - (end - start), prev_end


def run_query(db: duckdb.DuckDBPyConnection, q: AnalyticsQuery) -> dict[str, Any]:
    sql, params = _aggregate_sql(q, q.filters)
    result = [{k: _plain(v) for k, v in r.items()} for r in rows(db, sql, params)]
    out: dict[str, Any] = {"dimensions": q.dimensions, "rows": result, "sql": sql}

    if q.compare != "none":
        prev_start, prev_end = comparison_range(q)
        prev_filters = q.filters.model_copy(update={"start": prev_start, "end": prev_end})
        unlimited = q.model_copy(update={"limit": 5000})
        prev_sql, prev_params = _aggregate_sql(unlimited, prev_filters)
        cur_sql, cur_params = _aggregate_sql(unlimited, q.filters)
        out["rows"] = _diff(rows(db, cur_sql, cur_params), rows(db, prev_sql, prev_params), q)[: q.limit]
        out["compare_range"] = {"start": prev_start.isoformat(), "end": prev_end.isoformat()}
        totals_q = q.model_copy(update={"dimensions": [], "limit": 1})
        cur_total = rows(db, *_aggregate_sql(totals_q, q.filters))
        prev_total = rows(db, *_aggregate_sql(totals_q, prev_filters))
        out["totals"] = _diff(cur_total, prev_total, totals_q)[0]
    return out


def _diff(
    current: list[dict[str, Any]], previous: list[dict[str, Any]], q: AnalyticsQuery
) -> list[dict[str, Any]]:
    n = len(q.dimensions)

    def key(r: dict[str, Any]) -> tuple[Any, ...]:
        return tuple(_plain(r[f"d{i}"]) for i in range(n))

    cur = {key(r): r for r in current}
    prev = {key(r): r for r in previous}
    merged = []
    for k in list(cur) + [k for k in prev if k not in cur]:
        c = float(cur[k]["value"] or 0) if k in cur else 0.0
        p = float(prev[k]["value"] or 0) if k in prev else 0.0
        row: dict[str, Any] = {f"d{i}": k[i] for i in range(n)}
        row.update(
            current=c,
            previous=p,
            diff=c - p,
            pct=(c - p) / abs(p) * 100 if p else None,
            n=int(cur[k]["n"]) if k in cur else 0,
        )
        merged.append(row)
    total_diff = sum(r["diff"] for r in merged)
    additive = q.metric in ("total", "count")
    for r in merged:
        r["contribution"] = r["diff"] / total_diff * 100 if additive and total_diff else None
    merged.sort(key=lambda r: abs(r["diff"]), reverse=True)
    return merged


class Drilldown(BaseModel):
    query: AnalyticsQuery
    values: dict[str, str | None] = {}
    use_compare_range: bool = False
    limit: int = Field(default=500, ge=1, le=5000)


def drilldown(db: duckdb.DuckDBPyConnection, req: Drilldown) -> dict[str, Any]:
    q = req.query
    f = q.filters
    if req.use_compare_range and q.compare != "none":
        start, end = comparison_range(q)
        f = f.model_copy(update={"start": start, "end": end})
    where, params = where_clause(f, q.measure)
    for dim, val in req.values.items():
        if dim not in DIM_SQL:
            raise ValueError(f"unknown dimension: {dim}")
        if dim == "tag":
            if val == "(untagged)":
                where += " AND len(tags) = 0"
            else:
                where += " AND list_contains(tags, ?)"
                params.append(val)
        else:
            where += f" AND {DIM_SQL[dim]} = ?"
            params.append(datetime.date.fromisoformat(val) if dim in TIME_DIMS and val else val)
    value = MEASURES[q.measure][1]
    txns = rows(
        db,
        f"SELECT *, {value} AS value FROM reportable WHERE {where} "
        f"ORDER BY abs(amount) DESC LIMIT {req.limit}",
        params,
    )
    total = rows(db, f"SELECT SUM({value}) AS total, COUNT(*) AS n FROM reportable WHERE {where}", params)[0]
    return {
        "transactions": [{k: _plain(v) for k, v in t.items()} for t in txns],
        "total": _plain(total["total"]) or 0,
        "count": total["n"],
    }
