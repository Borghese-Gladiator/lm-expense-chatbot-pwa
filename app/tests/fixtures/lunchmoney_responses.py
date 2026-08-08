"""Mock LunchMoney API responses covering the tricky normalization scenarios.

Scenarios:
- multi_currency: EUR + GBP transactions with to_base amounts
- pending: a pending transaction (excluded from totals)
- transfer: an is_transfer transaction (excluded from totals)
- split: a split parent + child components
- excluded: an exclude_from_totals transaction
- paginated: > 1 page to exercise offset pagination
- empty: no transactions
- malformed: a transaction with a NULL date
"""

from __future__ import annotations

from typing import Any

ACCOUNTS_ASSETS: list[dict[str, Any]] = [
    {"id": 1, "name": "Cash Wallet", "currency": "usd", "balance": "500.00"},
    {"id": 2, "name": "Euro Savings", "currency": "eur", "balance": "1000.00"},
]

ACCOUNTS_PLAID: list[dict[str, Any]] = [
    {"id": 10, "name": "Checking", "currency": "usd", "balance": "2500.00",
     "institution_name": "Big Bank"},
]

CATEGORIES: list[dict[str, Any]] = [
    {"id": 100, "name": "Groceries"},
    {"id": 101, "name": "Dining"},
    {"id": 102, "name": "Salary", "is_income": True},
    {"id": 103, "name": "Transfer"},
    {"id": 104, "name": "Rent"},
]

TAGS: list[dict[str, Any]] = [
    {"id": 900, "name": "reimbursable"},
    {"id": 901, "name": "vacation"},
]


def _txn(**kwargs: Any) -> dict[str, Any]:
    base = {
        "id": 0,
        "date": "2024-01-15",
        "amount": "10.00",
        "currency": "usd",
        "payee": "Somewhere",
        "category_id": 100,
        "is_income": False,
        "exclude_from_totals": False,
        "status": "cleared",
        "asset_id": 1,
        "plaid_account_id": None,
        "tags": [],
    }
    base.update(kwargs)
    return base


def scenario_transactions(scenario: str) -> list[dict[str, Any]]:
    if scenario == "empty":
        return []

    if scenario == "malformed":
        return [_txn(id=1, date=None)]

    if scenario == "multi_currency":
        return [
            _txn(id=1, amount="42.00", currency="usd", category_id=100),
            _txn(id=2, amount="30.00", currency="eur", to_base="33.00",
                 category_id=101, asset_id=2),
            _txn(id=3, amount="20.00", currency="gbp", to_base="25.00",
                 category_id=101, asset_id=2),
        ]

    if scenario == "pending":
        return [
            _txn(id=1, amount="50.00", category_id=100, status="cleared"),
            _txn(id=2, amount="99.00", category_id=100, status="pending"),
        ]

    if scenario == "transfer":
        return [
            _txn(id=1, amount="50.00", category_id=100),
            _txn(id=2, amount="500.00", category_id=103, is_transfer=True),
        ]

    if scenario == "excluded":
        return [
            _txn(id=1, amount="50.00", category_id=100),
            _txn(id=2, amount="1000.00", category_id=104, exclude_from_totals=True),
        ]

    if scenario == "split":
        return [
            _txn(id=1, amount="100.00", category_id=100, payee="Costco"),
            _txn(id=2, amount="60.00", category_id=100, parent_id=1),
            _txn(id=3, amount="40.00", category_id=101, parent_id=1),
        ]

    if scenario == "income":
        return [
            _txn(id=1, amount="3000.00", category_id=102, is_income=True, payee="Employer"),
            _txn(id=2, amount="80.00", category_id=100),
        ]

    if scenario == "paginated":
        return [_txn(id=i, amount="5.00", category_id=100) for i in range(1, 12)]

    if scenario == "mixed":
        return [
            _txn(id=1, amount="3000.00", category_id=102, is_income=True, date="2024-01-01"),
            _txn(id=2, amount="120.00", category_id=100, date="2024-01-05"),
            _txn(id=3, amount="45.00", category_id=101, date="2024-01-06"),
            _txn(id=4, amount="1200.00", category_id=104, date="2024-01-02"),
            _txn(id=5, amount="500.00", category_id=103, is_transfer=True, date="2024-01-07"),
            _txn(id=6, amount="60.00", category_id=100, status="pending", date="2024-01-08"),
            _txn(id=7, amount="200.00", category_id=104, exclude_from_totals=True,
                 date="2024-01-09"),
            _txn(id=8, amount="30.00", currency="eur", to_base="33.00", category_id=101,
                 asset_id=2, date="2024-02-01"),
            _txn(id=9, amount="90.00", category_id=100, date="2024-02-02",
                 tags=[{"id": 900, "name": "reimbursable"}]),
            _txn(id=10, amount="2000.00", category_id=102, is_income=True, date="2024-02-01"),
        ]

    raise ValueError(f"unknown scenario: {scenario}")


def make_lunchmoney_pages(scenario: str, page_size: int = 5) -> list[dict[str, Any]]:
    """Build paginated /v1/transactions response pages for a named scenario."""
    txns = scenario_transactions(scenario)
    pages: list[dict[str, Any]] = []
    if not txns:
        return [{"transactions": [], "has_more": False}]
    for i in range(0, len(txns), page_size):
        chunk = txns[i : i + page_size]
        has_more = (i + page_size) < len(txns)
        pages.append({"transactions": chunk, "has_more": has_more})
    return pages
