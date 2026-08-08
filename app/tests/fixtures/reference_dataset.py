"""A small trusted reference dataset with hand-verified expected aggregates.

Sign convention: expenses negative, income positive (base currency = usd).
The `expected` dict encodes the answers a correct pipeline must produce over the
`transactions_included_in_totals` view (transfers/pending/excluded removed, split
parents removed in favor of components).
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from app.models.domain import NormalizedAccount, NormalizedTransaction

ACCOUNTS: list[NormalizedAccount] = [
    NormalizedAccount(
        account_key="manual:1", source="manual", source_id=1,
        name="Cash Wallet", currency="usd", balance=Decimal("500.00"),
    ),
    NormalizedAccount(
        account_key="plaid:10", source="plaid", source_id=10,
        name="Checking", currency="usd", balance=Decimal("2500.00"),
    ),
]

CATEGORIES: dict[int, str] = {
    100: "Groceries",
    101: "Dining",
    102: "Salary",
    103: "Transfer",
    104: "Rent",
}

BUDGETS: list[dict[str, Any]] = [
    {"category_id": 100, "category_name": "Groceries", "period_start": datetime.date(2024, 1, 1),
     "budgeted": "300.00", "actual": "165.00"},
    {"category_id": 104, "category_name": "Rent", "period_start": datetime.date(2024, 1, 1),
     "budgeted": "1200.00", "actual": "1200.00"},
]


def _t(**kwargs: Any) -> NormalizedTransaction:
    base: dict[str, Any] = {
        "account_key": "plaid:10",
        "currency": "usd",
        "payee": None,
        "category_id": None,
        "category_name": None,
        "tags": [],
        "is_transfer": False,
        "is_pending": False,
        "is_income": False,
        "excluded_from_totals": False,
        "parent_id": None,
    }
    base.update(kwargs)
    amt = base["amount"]
    base.setdefault("base_amount", amt)
    return NormalizedTransaction(**base)


# Included-in-totals rows (the ones that count):
#   Salary  +3000  (income, 2024-01-01)
#   Salary  +2000  (income, 2024-02-01)
#   Groceries -120 (2024-01-05)
#   Groceries -90  (2024-02-02)
#   Dining  -45    (2024-01-06)
#   Dining  -33    (eur->usd, 2024-02-01)
#   Rent    -1200  (2024-01-02)
# Excluded rows (must NOT count): transfer -500, pending -60, excluded -200
TRANSACTIONS: list[NormalizedTransaction] = [
    _t(id=1, date=datetime.date(2024, 1, 1), amount=Decimal("3000.00"),
       base_amount=Decimal("3000.00"), category_id=102, category_name="Salary",
       is_income=True, payee="Employer"),
    _t(id=2, date=datetime.date(2024, 1, 5), amount=Decimal("-120.00"),
       base_amount=Decimal("-120.00"), category_id=100, category_name="Groceries",
       account_key="manual:1"),
    _t(id=3, date=datetime.date(2024, 1, 6), amount=Decimal("-45.00"),
       base_amount=Decimal("-45.00"), category_id=101, category_name="Dining"),
    _t(id=4, date=datetime.date(2024, 1, 2), amount=Decimal("-1200.00"),
       base_amount=Decimal("-1200.00"), category_id=104, category_name="Rent"),
    _t(id=5, date=datetime.date(2024, 1, 7), amount=Decimal("-500.00"),
       base_amount=Decimal("-500.00"), category_id=103, category_name="Transfer",
       is_transfer=True, excluded_from_totals=True),
    _t(id=6, date=datetime.date(2024, 1, 8), amount=Decimal("-60.00"),
       base_amount=Decimal("-60.00"), category_id=100, category_name="Groceries",
       is_pending=True, excluded_from_totals=True),
    _t(id=7, date=datetime.date(2024, 1, 9), amount=Decimal("-200.00"),
       base_amount=Decimal("-200.00"), category_id=104, category_name="Rent",
       excluded_from_totals=True),
    _t(id=8, date=datetime.date(2024, 2, 1), amount=Decimal("-30.00"),
       base_amount=Decimal("-33.00"), currency="eur", category_id=101,
       category_name="Dining", account_key="manual:1"),
    _t(id=9, date=datetime.date(2024, 2, 2), amount=Decimal("-90.00"),
       base_amount=Decimal("-90.00"), category_id=100, category_name="Groceries",
       tags=["reimbursable"]),
    _t(id=10, date=datetime.date(2024, 2, 1), amount=Decimal("2000.00"),
       base_amount=Decimal("2000.00"), category_id=102, category_name="Salary",
       is_income=True),
]


def reference_dataset() -> tuple[list[NormalizedTransaction], dict[str, Any]]:
    expected: dict[str, Any] = {
        # included rows only
        "total_income": Decimal("5000.00"),
        "total_spend": Decimal("-1488.00"),  # -120-45-1200-33-90
        "net": Decimal("3512.00"),
        "included_row_count": 7,
        "spend_by_category": {
            "Groceries": Decimal("-210.00"),  # -120 - 90
            "Dining": Decimal("-78.00"),  # -45 - 33
            "Rent": Decimal("-1200.00"),
        },
        "spend_by_month": {
            "2024-01": Decimal("-1365.00"),  # -120 - 45 - 1200
            "2024-02": Decimal("-123.00"),  # -33 - 90
        },
        "income_by_month": {
            "2024-01": Decimal("3000.00"),
            "2024-02": Decimal("2000.00"),
        },
        "top_spend_category": "Rent",
        "account_count": 2,
        "excluded_transfer_amount": Decimal("-500.00"),
        "excluded_pending_amount": Decimal("-60.00"),
    }
    return TRANSACTIONS, expected
