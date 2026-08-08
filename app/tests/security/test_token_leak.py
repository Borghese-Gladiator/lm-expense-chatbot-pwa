"""Security tests: the LunchMoney token never appears in responses, logs, or stored analysis."""

from __future__ import annotations

import datetime
import logging

import duckdb
import httpx
import pytest
from pydantic import SecretStr

from app.agent.analyst import AnalystAgent
from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.lunchmoney.client import LunchMoneyAuthError, LunchMoneyClient
from app.lunchmoney.sync import seed_reference, sync_snapshot
from tests.fixtures.reference_dataset import ACCOUNTS, BUDGETS, CATEGORIES, reference_dataset
from tests.integration.fake_anthropic import FakeAnthropic, query_then_chart_script
from tests.integration.mock_lm import MockLM

pytestmark = pytest.mark.integration

TOKEN = "lm_super_secret_token_abc123"
LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)


def _seeded_db() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    init_schema(conn)
    txns, _ = reference_dataset()
    seed_reference(conn, txns, ACCOUNTS, CATEGORIES, BUDGETS)
    return conn


def test_settings_secretstr_repr_hides_token():
    secret = SecretStr(TOKEN)
    assert TOKEN not in repr(secret)
    assert TOKEN not in str(secret)


async def test_token_not_in_agent_messages_or_stored_records():
    db = _seeded_db()
    registry = ResultRegistry(db, LIMITS)
    sql = (
        "SELECT category_name, SUM(base_amount) AS total "
        "FROM analytics.transactions_included_in_totals WHERE NOT is_income "
        "GROUP BY category_name ORDER BY total"
    )
    view = {"chart_type": "bar",
            "x": {"field": "category_name", "type": "nominal"},
            "y": {"field": "total", "type": "quantitative"}}
    fake = FakeAnthropic(query_then_chart_script(sql, view))
    agent = AnalystAgent(fake, db, registry, LIMITS, "fake", "usd")

    env = await agent.answer("spend by category", None, None)

    # nothing sent to the model contains the token
    assert TOKEN not in repr(fake.messages.calls)
    # the response envelope does not contain it
    assert TOKEN not in env.model_dump_json()
    # stored analysis records do not contain it
    for rid in registry._records:
        assert TOKEN not in registry.get_record(rid).model_dump_json()


async def test_token_not_logged_during_sync(caplog):
    db = _seeded_db()
    mock = MockLM("mixed", require_bearer=TOKEN)
    http = httpx.AsyncClient(transport=mock.transport())
    client = LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)
    with caplog.at_level(logging.DEBUG):
        try:
            await sync_snapshot(
                client, db, datetime.date(2024, 1, 1), datetime.date(2024, 12, 31), "usd"
            )
        finally:
            await http.aclose()
    assert TOKEN not in caplog.text


async def test_auth_error_message_redacts_token():
    mock = MockLM("mixed", require_bearer="a-different-token")
    http = httpx.AsyncClient(transport=mock.transport())
    client = LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)
    with pytest.raises(LunchMoneyAuthError) as exc:
        try:
            await client.get_accounts()
        finally:
            await http.aclose()
    assert TOKEN not in str(exc.value)
    assert TOKEN not in repr(exc.value)


async def test_sync_result_has_no_token():
    db = _seeded_db()
    mock = MockLM("mixed")
    http = httpx.AsyncClient(transport=mock.transport())
    client = LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)
    try:
        result = await sync_snapshot(
            client, db, datetime.date(2024, 1, 1), datetime.date(2024, 12, 31), "usd"
        )
    finally:
        await http.aclose()
    assert TOKEN not in result.model_dump_json()
