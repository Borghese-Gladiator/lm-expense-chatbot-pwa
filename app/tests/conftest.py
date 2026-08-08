"""Shared pytest fixtures."""

from __future__ import annotations

import duckdb
import pytest

from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.lunchmoney.sync import seed_reference
from tests.fixtures.reference_dataset import (
    ACCOUNTS,
    BUDGETS,
    CATEGORIES,
    reference_dataset,
)


@pytest.fixture
def db() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    init_schema(conn)
    yield conn
    conn.close()


@pytest.fixture
def seeded_db(db: duckdb.DuckDBPyConnection) -> duckdb.DuckDBPyConnection:
    txns, _ = reference_dataset()
    seed_reference(db, txns, ACCOUNTS, CATEGORIES, BUDGETS)
    return db


@pytest.fixture
def limits() -> ValidatorLimits:
    return ValidatorLimits(max_rows=10_000, max_bytes=5_000_000, max_time_ms=10_000)


@pytest.fixture
def registry(seeded_db: duckdb.DuckDBPyConnection, limits: ValidatorLimits) -> ResultRegistry:
    return ResultRegistry(seeded_db, limits)


@pytest.fixture
def expected() -> dict:
    _, exp = reference_dataset()
    return exp
