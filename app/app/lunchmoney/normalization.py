"""Normalization: Decimal amounts, sign rules, base currency, account unification."""

from __future__ import annotations

import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from app.models.domain import NormalizedAccount, NormalizedTransaction


def account_key(source: str, source_id: int) -> str:
    if source not in ("manual", "plaid"):
        raise ValueError(f"unknown account source: {source}")
    return f"{source}:{source_id}"


def parse_amount(raw: str | float | int, currency: str) -> Decimal:
    """Parse a raw amount into a Decimal without float rounding error."""
    if isinstance(raw, str):
        cleaned = raw.strip().replace(",", "")
        if cleaned == "":
            raise ValueError("empty amount")
        try:
            return Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError(f"invalid amount: {raw!r}") from exc
    # Route floats through str to avoid binary float artifacts.
    return Decimal(str(raw))


def to_base_amount(
    amount: Decimal,
    currency: str,
    base_currency: str,
    rate: Decimal | None,
) -> Decimal:
    """Convert an amount to base currency using the snapshot rate.

    LunchMoney's `to_base` is amount already expressed in base currency; when a
    caller supplies it we use it directly. Otherwise apply the FX rate. When the
    currency already equals base, the rate is 1.
    """
    if currency.lower() == base_currency.lower():
        return amount
    if rate is None:
        raise ValueError(f"missing FX rate for {currency}->{base_currency}")
    return amount * rate


def apply_sign_rules(amount: Decimal, is_income: bool) -> Decimal:
    """Expenses are negative, income positive.

    LunchMoney reports amounts as positive for debits (spend). We normalize so
    that spend is negative and income is positive, giving a signed `net` where
    sum(base_amount) over included rows == net cash flow.
    """
    magnitude = abs(amount)
    return magnitude if is_income else -magnitude


def normalize_account(raw: dict[str, Any], source: Literal["manual", "plaid"]) -> NormalizedAccount:
    source_id = int(raw["id"])
    balance_raw = raw.get("balance")
    balance = (
        parse_amount(balance_raw, raw.get("currency", "usd"))
        if balance_raw not in (None, "")
        else None
    )
    return NormalizedAccount(
        account_key=account_key(source, source_id),
        source=source,
        source_id=source_id,
        name=str(raw.get("name") or raw.get("display_name") or f"{source}:{source_id}"),
        currency=str(raw.get("currency", "usd")).lower(),
        balance=balance,
    )


def _resolve_account_key(raw: dict[str, Any]) -> str:
    """Map a raw transaction to its unified account key.

    plaid_account_id wins when present; otherwise asset_id denotes a manual account.
    """
    plaid_id = raw.get("plaid_account_id")
    if plaid_id is not None:
        return account_key("plaid", int(plaid_id))
    asset_id = raw.get("asset_id")
    if asset_id is not None:
        return account_key("manual", int(asset_id))
    return "unknown:0"


def _coerce_date(value: Any) -> datetime.date:
    if isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(str(value))


def normalize_transaction(
    raw: dict[str, Any],
    accounts: dict[str, NormalizedAccount],
    categories: dict[int, str],
    tags: dict[int, str],
    base_currency: str,
) -> NormalizedTransaction:
    txn_id = int(raw["id"])
    currency = str(raw.get("currency", base_currency)).lower()
    amount = parse_amount(raw["amount"], currency)

    is_income = bool(raw.get("is_income", False))
    signed = apply_sign_rules(amount, is_income)

    to_base = raw.get("to_base")
    if to_base is not None:
        base_magnitude = parse_amount(to_base, base_currency)
        base_amount = base_magnitude if is_income else -abs(base_magnitude)
    else:
        rate = (
            parse_amount(raw["fx_rate"], base_currency)
            if raw.get("fx_rate") is not None
            else None
        )
        base_amount = to_base_amount(signed, currency, base_currency, rate)

    category_id = raw.get("category_id")
    category_id = int(category_id) if category_id is not None else None
    category_name = categories.get(category_id) if category_id is not None else None

    raw_tags = raw.get("tags") or []
    tag_names: list[str] = []
    for tag in raw_tags:
        if isinstance(tag, dict):
            name = tag.get("name")
            if name:
                tag_names.append(str(name))
            elif tag.get("id") is not None:
                tag_names.append(tags.get(int(tag["id"]), str(tag["id"])))
        elif isinstance(tag, int):
            tag_names.append(tags.get(tag, str(tag)))
        else:
            tag_names.append(str(tag))

    status = str(raw.get("status", "")).lower()
    if raw.get("is_pending") is not None:
        is_pending = bool(raw["is_pending"])
    else:
        is_pending = status == "pending"

    is_transfer = bool(raw.get("is_transfer", False))
    if not is_transfer and category_name:
        is_transfer = category_name.strip().lower() in (
            "transfer",
            "transfers",
            "payment, transfer",
        )

    excluded = bool(raw.get("exclude_from_totals", False)) or is_transfer or is_pending

    parent_id = raw.get("parent_id")
    parent_id = int(parent_id) if parent_id is not None else None

    return NormalizedTransaction(
        id=txn_id,
        date=_coerce_date(raw["date"]),
        account_key=_resolve_account_key(raw),
        amount=signed,
        base_amount=base_amount,
        currency=currency,
        payee=raw.get("payee"),
        category_id=category_id,
        category_name=category_name,
        tags=tag_names,
        is_transfer=is_transfer,
        is_pending=is_pending,
        is_income=is_income,
        excluded_from_totals=excluded,
        parent_id=parent_id,
    )


def normalize_snapshot(
    raw_txns: list[dict[str, Any]],
    raw_accounts: list[dict[str, Any]],
    raw_categories: list[dict[str, Any]],
    raw_tags: list[dict[str, Any]],
    base_currency: str,
) -> tuple[list[NormalizedTransaction], list[NormalizedAccount]]:
    accounts: list[NormalizedAccount] = []
    for raw in raw_accounts:
        source: Literal["manual", "plaid"]
        if "source" in raw:
            source = "plaid" if str(raw["source"]) == "plaid" else "manual"
        else:
            source = "plaid" if raw.get("plaid") or raw.get("institution_name") else "manual"
        accounts.append(normalize_account(raw, source))

    accounts_by_key = {acct.account_key: acct for acct in accounts}
    categories = {int(c["id"]): str(c["name"]) for c in raw_categories}
    tags = {int(t["id"]): str(t["name"]) for t in raw_tags}

    txns = [
        normalize_transaction(raw, accounts_by_key, categories, tags, base_currency)
        for raw in raw_txns
    ]
    return txns, accounts
