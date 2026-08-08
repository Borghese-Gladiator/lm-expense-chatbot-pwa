"""Unit tests for semantic views: transfer/pending/excluded/split exclusion rules."""

from __future__ import annotations

from decimal import Decimal

import pytest

pytestmark = pytest.mark.unit


def _scalar(db, sql):
    return db.execute(sql).fetchone()[0]


def test_included_view_excludes_transfer_pending_excluded(seeded_db):
    total = _scalar(seeded_db, "SELECT COUNT(*) FROM analytics.transactions")
    included = _scalar(
        seeded_db, "SELECT COUNT(*) FROM analytics.transactions_included_in_totals"
    )
    assert total == 10
    assert included == 7


def test_net_matches_reference(seeded_db, expected):
    net = _scalar(
        seeded_db, "SELECT SUM(base_amount) FROM analytics.transactions_included_in_totals"
    )
    assert net == expected["net"]


def test_income_and_spend_split(seeded_db, expected):
    income = _scalar(
        seeded_db,
        "SELECT SUM(base_amount) FROM analytics.transactions_included_in_totals WHERE is_income",
    )
    spend = _scalar(
        seeded_db,
        "SELECT SUM(base_amount) FROM analytics.transactions_included_in_totals "
        "WHERE NOT is_income",
    )
    assert income == expected["total_income"]
    assert spend == expected["total_spend"]


def test_transfer_row_present_in_raw_absent_in_totals(seeded_db):
    raw_transfer = _scalar(
        seeded_db, "SELECT COUNT(*) FROM analytics.transactions WHERE is_transfer"
    )
    totals_transfer = _scalar(
        seeded_db,
        "SELECT COUNT(*) FROM analytics.transactions_included_in_totals WHERE is_transfer",
    )
    assert raw_transfer == 1
    assert totals_transfer == 0


def test_spend_by_category(seeded_db, expected):
    rows = seeded_db.execute(
        "SELECT category_name, SUM(base_amount) FROM analytics.transactions_included_in_totals "
        "WHERE NOT is_income GROUP BY category_name"
    ).fetchall()
    by_cat = {name: amt for name, amt in rows}
    for cat, amt in expected["spend_by_category"].items():
        assert by_cat[cat] == amt


def test_component_view_excludes_split_parent(db):
    from app.lunchmoney.normalization import normalize_snapshot
    from app.lunchmoney.sync import seed_reference
    from tests.fixtures.lunchmoney_responses import CATEGORIES, scenario_transactions

    raws = scenario_transactions("split")
    accounts_raw = [{"id": 1, "name": "Cash", "currency": "usd", "source": "manual"}]
    txns, accounts = normalize_snapshot(raws, accounts_raw, CATEGORIES, [], "usd")
    seed_reference(db, txns, accounts)

    # parent id=1 should be excluded from components; children 2,3 present
    parent_present = _scalar(
        db, "SELECT COUNT(*) FROM analytics.transaction_components WHERE id = 1"
    )
    children = _scalar(
        db, "SELECT COUNT(*) FROM analytics.transaction_components WHERE id IN (2, 3)"
    )
    assert parent_present == 0
    assert children == 2


def test_budget_performance_variance(seeded_db):
    rows = seeded_db.execute(
        "SELECT category_name, variance FROM analytics.budget_performance ORDER BY category_name"
    ).fetchall()
    variances = {name: var for name, var in rows}
    assert variances["Groceries"] == Decimal("-135.00")  # 165 - 300
    assert variances["Rent"] == Decimal("0.00")
