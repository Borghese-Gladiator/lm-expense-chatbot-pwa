"""Unit tests for normalization: amount, sign, base currency, account unification."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.lunchmoney.normalization import (
    account_key,
    apply_sign_rules,
    normalize_snapshot,
    normalize_transaction,
    parse_amount,
    to_base_amount,
)
from app.models.domain import NormalizedAccount
from tests.fixtures.lunchmoney_responses import (
    ACCOUNTS_ASSETS,
    ACCOUNTS_PLAID,
    CATEGORIES,
    TAGS,
    scenario_transactions,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("10.00", Decimal("10.00")),
        ("1,234.56", Decimal("1234.56")),
        (0.1, Decimal("0.1")),
        (42, Decimal("42")),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw, "usd") == expected


def test_parse_amount_no_float_error():
    # 0.1 + 0.2 via Decimal(str(...)) stays exact
    assert parse_amount(0.1, "usd") + parse_amount(0.2, "usd") == Decimal("0.3")


@pytest.mark.parametrize("bad", ["", "abc", "  "])
def test_parse_amount_invalid(bad):
    with pytest.raises(ValueError):
        parse_amount(bad, "usd")


@pytest.mark.parametrize(
    "amount,is_income,expected",
    [
        (Decimal("10"), False, Decimal("-10")),
        (Decimal("-10"), False, Decimal("-10")),
        (Decimal("10"), True, Decimal("10")),
        (Decimal("-10"), True, Decimal("10")),
    ],
)
def test_apply_sign_rules(amount, is_income, expected):
    assert apply_sign_rules(amount, is_income) == expected


def test_to_base_same_currency_is_identity():
    assert to_base_amount(Decimal("10"), "usd", "usd", None) == Decimal("10")


def test_to_base_applies_rate():
    assert to_base_amount(Decimal("10"), "eur", "usd", Decimal("1.1")) == Decimal("11.0")


def test_to_base_missing_rate_raises():
    with pytest.raises(ValueError):
        to_base_amount(Decimal("10"), "eur", "usd", None)


@pytest.mark.parametrize(
    "source,source_id,expected",
    [("manual", 1, "manual:1"), ("plaid", 10, "plaid:10")],
)
def test_account_key(source, source_id, expected):
    assert account_key(source, source_id) == expected


def test_account_key_rejects_unknown_source():
    with pytest.raises(ValueError):
        account_key("weird", 1)


def _accounts_by_key() -> dict[str, NormalizedAccount]:
    _, accounts = normalize_snapshot(
        [], ACCOUNTS_ASSETS + [{**a} for a in ACCOUNTS_PLAID], CATEGORIES, TAGS, "usd"
    )
    # assets come without 'source'; plaid entries carry institution_name
    return {a.account_key: a for a in accounts}


def test_manual_and_plaid_accounts_unified():
    _, accounts = normalize_snapshot(
        [],
        [{**a, "source": "manual"} for a in ACCOUNTS_ASSETS]
        + [{**a, "source": "plaid"} for a in ACCOUNTS_PLAID],
        CATEGORIES,
        TAGS,
        "usd",
    )
    keys = {a.account_key for a in accounts}
    assert "manual:1" in keys
    assert "manual:2" in keys
    assert "plaid:10" in keys


def test_multi_currency_uses_to_base():
    raws = scenario_transactions("multi_currency")
    accounts = {
        "manual:1": NormalizedAccount(account_key="manual:1", source="manual", source_id=1,
                                      name="Cash", currency="usd"),
        "manual:2": NormalizedAccount(account_key="manual:2", source="manual", source_id=2,
                                      name="Euro", currency="eur"),
    }
    cats = {c["id"]: c["name"] for c in CATEGORIES}
    eur = next(normalize_transaction(r, accounts, cats, {}, "usd") for r in raws if r["id"] == 2)
    assert eur.currency == "eur"
    assert eur.base_amount == Decimal("-33.00")  # expense, magnitude of to_base


def test_transfer_and_pending_flags_set_excluded():
    for scenario, target_id in [("transfer", 2), ("pending", 2)]:
        raws = scenario_transactions(scenario)
        accounts = {"manual:1": NormalizedAccount(
            account_key="manual:1", source="manual", source_id=1, name="c", currency="usd")}
        cats = {c["id"]: c["name"] for c in CATEGORIES}
        target = next(
            normalize_transaction(r, accounts, cats, {}, "usd")
            for r in raws if r["id"] == target_id
        )
        assert target.excluded_from_totals is True


def test_tags_hydrated_by_name():
    raws = [{
        "id": 1, "date": "2024-01-01", "amount": "5.00", "currency": "usd",
        "category_id": 100, "asset_id": 1, "tags": [{"id": 900}],
    }]
    accounts = {"manual:1": NormalizedAccount(
        account_key="manual:1", source="manual", source_id=1, name="c", currency="usd")}
    cats = {c["id"]: c["name"] for c in CATEGORIES}
    tags = {t["id"]: t["name"] for t in TAGS}
    txn = normalize_transaction(raws[0], accounts, cats, tags, "usd")
    assert txn.tags == ["reimbursable"]


def test_category_hydration():
    raws = [{
        "id": 1, "date": "2024-01-01", "amount": "5.00", "currency": "usd",
        "category_id": 101, "asset_id": 1,
    }]
    accounts = {"manual:1": NormalizedAccount(
        account_key="manual:1", source="manual", source_id=1, name="c", currency="usd")}
    cats = {c["id"]: c["name"] for c in CATEGORIES}
    txn = normalize_transaction(raws[0], accounts, cats, {}, "usd")
    assert txn.category_name == "Dining"


def test_income_positive_expense_negative_signs():
    raws = scenario_transactions("income")
    accounts = {"manual:1": NormalizedAccount(
        account_key="manual:1", source="manual", source_id=1, name="c", currency="usd")}
    cats = {c["id"]: c["name"] for c in CATEGORIES}
    txns = [normalize_transaction(r, accounts, cats, {}, "usd") for r in raws]
    income = next(t for t in txns if t.is_income)
    expense = next(t for t in txns if not t.is_income)
    assert income.amount > 0
    assert expense.amount < 0
