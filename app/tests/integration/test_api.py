"""API-level integration tests over the full FastAPI app with mocked externals."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

import duckdb
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.agent.analyst import AnalystAgent
from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.api import health, query, results, sync
from app.lunchmoney.client import LunchMoneyClient
from tests.integration.fake_anthropic import FakeAnthropic, query_then_chart_script
from tests.integration.mock_lm import MockLM

pytestmark = pytest.mark.integration

TOKEN = "api-secret-token"
LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)

SPEND_SQL = (
    "SELECT category_name, SUM(base_amount) AS total "
    "FROM analytics.transactions_included_in_totals WHERE NOT is_income "
    "GROUP BY category_name ORDER BY total"
)
BAR_SPEC = {
    "chart_type": "bar",
    "x": {"field": "category_name", "type": "nominal"},
    "y": {"field": "total", "type": "quantitative"},
    "title": "Spend by category",
}


def _build_app() -> FastAPI:
    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = duckdb.connect(":memory:")
        init_schema(db)
        http = httpx.AsyncClient(transport=MockLM("mixed").transport())
        registry = ResultRegistry(db, LIMITS)
        lm_client = LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)
        fake = FakeAnthropic(query_then_chart_script(SPEND_SQL, BAR_SPEC))
        agent = AnalystAgent(fake, db, registry, LIMITS, "fake", "usd")
        app.state.http = http
        app.state.db = db
        app.state.registry = registry
        app.state.lm_client = lm_client
        app.state.agent = agent
        app.state.fake = fake
        try:
            yield
        finally:
            await http.aclose()
            db.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(sync.router)
    app.include_router(query.router)
    app.include_router(results.router)
    app.include_router(health.router)
    return app


def test_full_api_flow():
    app = _build_app()
    with TestClient(app) as client:
        health_resp = client.get("/api/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["db"] is True

        sync_resp = client.post("/api/sync", json={})
        assert sync_resp.status_code == 200
        sync_body = sync_resp.json()
        assert sync_body["synced"] is True
        assert sync_body["transactions_written"] == 10

        q_resp = client.post("/api/query", json={"question": "spend by category"})
        assert q_resp.status_code == 200
        env = q_resp.json()
        assert env["result_id"]
        kinds = [b["kind"] for b in env["blocks"]]
        assert "chart" in kinds
        rid = env["result_id"]

        rows_resp = client.get(f"/api/results/{rid}/rows?offset=0&limit=100")
        assert rows_resp.status_code == 200
        assert rows_resp.json()["columns"] == ["category_name", "total"]

        # token never leaks through any response
        combined = health_resp.text + sync_resp.text + q_resp.text + rows_resp.text
        assert TOKEN not in combined


def test_results_404_for_unknown_id():
    app = _build_app()
    with TestClient(app) as client:
        resp = client.get("/api/results/nope")
        assert resp.status_code == 404


def test_show_as_table_reuses_result_over_api():
    app = _build_app()
    with TestClient(app) as client:
        client.post("/api/sync", json={})
        first = client.post("/api/query", json={"question": "spend by category"}).json()
        rid = first["result_id"]

        # reset the fake to a table-only script referencing the prior result
        table_script = [
            [{"type": "tool_use", "id": "v1", "name": "create_view",
              "input": {"result_id": rid, "view_spec": {"chart_type": "table"}}}],
            [{"type": "text", "text": "As a table."}],
        ]
        app.state.agent._client = FakeAnthropic(table_script)
        before = len(app.state.registry._results)
        second = client.post(
            "/api/query", json={"question": "show that as a table", "result_id": rid}
        ).json()
        after = len(app.state.registry._results)

        assert second["result_id"] == rid
        assert before == after  # source query not re-run
