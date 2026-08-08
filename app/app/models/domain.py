"""Normalized domain models for DuckDB insertion."""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class NormalizedAccount(BaseModel):
    account_key: str
    source: Literal["manual", "plaid"]
    source_id: int
    name: str
    currency: str
    balance: Decimal | None = None


class NormalizedTransaction(BaseModel):
    id: int
    date: datetime.date
    account_key: str
    amount: Decimal
    base_amount: Decimal
    currency: str
    payee: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    tags: list[str] = []
    is_transfer: bool = False
    is_pending: bool = False
    is_income: bool = False
    excluded_from_totals: bool = False
    parent_id: int | None = None
