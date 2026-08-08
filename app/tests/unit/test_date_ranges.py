"""Unit tests for relative date-range resolution."""

from __future__ import annotations

import datetime

import pytest

from app.analytics.result_registry import resolve_date_range
from app.models.queries import DateRange

pytestmark = pytest.mark.unit

TODAY = datetime.date(2024, 3, 15)
BOUNDS = DateRange(start=datetime.date(2023, 1, 1), end=datetime.date(2024, 3, 15))


@pytest.mark.parametrize(
    "question,start,end",
    [
        ("how much did I spend last month", datetime.date(2024, 2, 1), datetime.date(2024, 2, 29)),
        ("spending this month", datetime.date(2024, 3, 1), datetime.date(2024, 3, 31)),
        ("total last year", datetime.date(2023, 1, 1), datetime.date(2023, 12, 31)),
        ("income this year", datetime.date(2024, 1, 1), datetime.date(2024, 3, 15)),
        ("spend in January", datetime.date(2024, 1, 1), datetime.date(2024, 1, 31)),
        ("spend in February 2023", datetime.date(2023, 2, 1), datetime.date(2023, 2, 28)),
    ],
)
def test_relative_ranges(question, start, end):
    dr = resolve_date_range(question, TODAY, None)
    assert dr is not None
    assert dr.start == start
    assert dr.end == end


def test_last_n_days():
    dr = resolve_date_range("show me the last 30 days", TODAY, None)
    assert dr is not None
    assert dr.start == datetime.date(2024, 2, 14)
    assert dr.end == TODAY


def test_no_temporal_phrase_returns_none():
    assert resolve_date_range("what is my top category", TODAY, None) is None


def test_range_clamped_to_bounds():
    dr = resolve_date_range("last year", TODAY, BOUNDS)
    assert dr is not None
    assert dr.start >= BOUNDS.start
    assert dr.end <= BOUNDS.end


def test_year_mentioned():
    dr = resolve_date_range("spend in 2023", TODAY, None)
    assert dr is not None
    assert dr.start == datetime.date(2023, 1, 1)
    assert dr.end == datetime.date(2023, 12, 31)
