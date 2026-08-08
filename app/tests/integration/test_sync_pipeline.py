"""Integration tests over the sync pipeline: pagination, retries, dup sync, malformed, empty."""

from __future__ import annotations

import datetime

import duckdb
import httpx
import pytest
from pydantic import SecretStr

from app.analytics.database import init_schema
from app.lunchmoney.client import LunchMoneyClient
from app.lunchmoney.sync import sync_snapshot
from tests.integration.mock_lm import MockLM

pytestmark = pytest.mark.integration

START = datetime.date(2024, 1, 1)
END = datetime.date(2024, 12, 31)
TOKEN = "secret-token-value"


def _fresh_db() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    init_schema(conn)
    return conn


async def _client(mock: MockLM) -> LunchMoneyClient:
    http = httpx.AsyncClient(transport=mock.transport())
    return LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)


async def _sync(mock: MockLM, db: duckdb.DuckDBPyConnection):
    client = await _client(mock)
    try:
        return await sync_snapshot(client, db, START, END, "usd")
    finally:
        await client._http.aclose()


async def test_pagination_reads_all_pages():
    mock = MockLM("paginated", page_size=5)
    db = _fresh_db()
    result = await _sync(mock, db)
    assert result.transactions_written == 11
    count = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    assert count == 11


async def test_retry_on_429_then_success():
    mock = MockLM("mixed", fail_429_times=2)
    db = _fresh_db()
    result = await _sync(mock, db)
    assert result.synced is True
    assert result.transactions_written == 10


async def test_retry_on_500_then_success():
    mock = MockLM("mixed", fail_500_times=2)
    db = _fresh_db()
    result = await _sync(mock, db)
    assert result.synced is True


async def test_duplicate_sync_is_idempotent():
    db = _fresh_db()
    mock1 = MockLM("mixed")
    r1 = await _sync(mock1, db)
    count1 = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]

    mock2 = MockLM("mixed")
    r2 = await _sync(mock2, db)
    count2 = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]

    assert count1 == count2 == 10
    assert r1.transactions_written == r2.transactions_written


async def test_vanished_transactions_dropped():
    db = _fresh_db()
    await _sync(MockLM("mixed"), db)  # 10 txns
    before = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    # a snapshot with fewer rows in the same window
    result = await _sync(MockLM("pending"), db)  # 2 txns
    after = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    assert before == 10
    assert after == 2
    assert result.transactions_dropped == 8


async def test_malformed_snapshot_rolls_back():
    db = _fresh_db()
    await _sync(MockLM("mixed"), db)  # seed 10 good rows
    seeded = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    with pytest.raises(ValueError):
        await _sync(MockLM("malformed"), db)
    # rollback: original rows intact
    after = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    assert seeded == 10
    assert after == 10


async def test_empty_snapshot():
    db = _fresh_db()
    result = await _sync(MockLM("empty"), db)
    assert result.transactions_written == 0
    count = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()[0]
    assert count == 0


async def test_bearer_auth_sent():
    mock = MockLM("mixed", require_bearer=TOKEN)
    db = _fresh_db()
    result = await _sync(mock, db)
    assert result.synced is True
    assert all(h == f"Bearer {TOKEN}" for h in mock.seen_auth_headers if h)


async def test_auth_error_raised_without_token_leak():
    from app.lunchmoney.client import LunchMoneyAuthError

    mock = MockLM("mixed", require_bearer="different-token")
    db = _fresh_db()
    with pytest.raises(LunchMoneyAuthError) as exc:
        await _sync(mock, db)
    assert TOKEN not in str(exc.value)
