import pytest

from app.analytics import AnalyticsQuery, Drilldown, drilldown, run_query

SEP = {"start": "2026-09-01", "end": "2026-09-30"}
OCT = {"start": "2026-10-01", "end": "2026-10-31"}


def q(**kw):
    return AnalyticsQuery.model_validate(kw)


def total(db, **kw):
    return run_query(db, q(**kw))["rows"][0]["value"]


@pytest.mark.parametrize(
    "kw, expected",
    [
        # 80 + 120 - 20 refund + 60 + 40 split children; transfer, pending, split parent left out
        ({"filters": OCT}, 280),
        ({"filters": {**OCT, "include_pending": True}}, 320),
        ({"measure": "income", "filters": OCT}, 3000),
        ({"measure": "net", "filters": OCT}, 2720),
        ({"filters": SEP}, 80),
        ({"metric": "count", "filters": OCT}, 5),
        ({"filters": {**OCT, "tags": ["date night"]}}, 120),
        ({"filters": {**OCT, "search": "whole"}}, 80),
        ({"filters": {**OCT, "amount_min": 100}}, 120),
    ],
)
def test_totals(seeded, kw, expected):
    assert total(seeded, **kw) == pytest.approx(expected)


def test_exclude_one_off_recalculates(seeded):
    big = seeded.execute("SELECT id FROM transactions WHERE amount = -120").fetchone()[0]
    assert total(seeded, filters={**OCT, "exclude_ids": [big]}) == pytest.approx(160)


def test_group_by_category(seeded):
    out = run_query(seeded, q(dimensions=["category"], filters=OCT))["rows"]
    assert {r["d0"]: r["value"] for r in out} == {
        "Groceries": 120,
        "Restaurants": 100,
        "Shopping": 60,
    }
    assert out[0]["d0"] == "Groceries"


def test_group_by_tag_counts_untagged(seeded):
    out = run_query(seeded, q(dimensions=["tag"], filters=OCT))["rows"]
    assert {r["d0"]: r["value"] for r in out} == {"date night": 120, "(untagged)": 160}


def test_month_by_category_pct_and_cumulative(seeded):
    rows = run_query(seeded, q(dimensions=["month", "category"], metric="pct_of_total"))["rows"]
    oct_share = sum(r["value"] for r in rows if r["d0"] == "2026-10-01")
    assert oct_share == pytest.approx(100)

    cum = run_query(seeded, q(dimensions=["month"], metric="cumulative"))["rows"]
    assert [r["value"] for r in cum] == [80, 360]


def test_median(seeded):
    assert total(seeded, metric="median", filters=OCT) == pytest.approx(60)


def test_compare_contributions_sum_to_change(seeded):
    out = run_query(
        seeded,
        q(
            dimensions=["category"],
            filters=OCT,
            compare="custom",
            compare_start="2026-09-01",
            compare_end="2026-09-30",
        ),
    )
    assert out["totals"]["current"] == 280
    assert out["totals"]["previous"] == 80
    assert sum(r["diff"] for r in out["rows"]) == pytest.approx(200)
    assert sum(r["contribution"] for r in out["rows"]) == pytest.approx(100)
    shopping = next(r for r in out["rows"] if r["d0"] == "Shopping")
    assert shopping["previous"] == 0 and shopping["pct"] is None


@pytest.mark.parametrize(
    "start, end, compare, expected",
    [
        ("2026-10-01", "2026-10-10", "previous_period", ("2026-09-21", "2026-09-30")),
        ("2026-10-01", "2026-10-31", "previous_period", ("2026-09-01", "2026-09-30")),
        ("2026-03-01", "2026-03-31", "previous_period", ("2026-02-01", "2026-02-28")),
        ("2026-01-01", "2026-03-31", "previous_period", ("2025-10-01", "2025-12-31")),
        ("2024-02-29", "2024-02-29", "same_period_last_year", ("2023-02-28", "2023-02-28")),
    ],
)
def test_comparison_range(seeded, start, end, compare, expected):
    out = run_query(seeded, q(filters={"start": start, "end": end}, compare=compare))
    assert (out["compare_range"]["start"], out["compare_range"]["end"]) == expected


def test_drilldown_matches_aggregate(seeded):
    query = q(dimensions=["category", "month"], filters=OCT)
    agg = {(r["d0"], r["d1"]): r["value"] for r in run_query(seeded, query)["rows"]}
    dd = drilldown(seeded, Drilldown(query=query, values={"category": "Restaurants", "month": "2026-10-01"}))
    assert dd["total"] == agg[("Restaurants", "2026-10-01")] == 100
    assert dd["count"] == 2


def test_drilldown_untagged(seeded):
    dd = drilldown(seeded, Drilldown(query=q(dimensions=["tag"], filters=OCT), values={"tag": "(untagged)"}))
    assert dd["total"] == 160


@pytest.mark.parametrize(
    "kw",
    [
        {"metric": "cumulative", "dimensions": ["category"]},
        {"compare": "previous_period"},
        {"compare": "previous_period", "filters": OCT, "dimensions": ["month"]},
        {"dimensions": ["month", "month"]},
    ],
)
def test_invalid_queries(kw):
    with pytest.raises(ValueError):
        q(**kw)
