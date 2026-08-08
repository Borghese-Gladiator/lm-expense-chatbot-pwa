"""Run a demo server backed by fixtures (no external API keys required).

Serves the real frontend at / plus the API wired to a mock LunchMoney transport and
a scripted fake Anthropic client that answers a small set of demo questions.

Run: PYTHONPATH=. .venv/bin/python scripts/demo_server.py
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

import duckdb
import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import SecretStr

from app.agent.analyst import AnalystAgent
from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.api import health, query, results, sync
from app.lunchmoney.client import LunchMoneyClient
from app.main import FRONTEND_DIR
from tests.integration.fake_anthropic import FakeAnthropic
from tests.integration.mock_lm import MockLM

LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)
INCLUDED = "analytics.transactions_included_in_totals"


class DemoAgent(AnalystAgent):
    """Pick a canned script based on the question keywords, then run the real loop."""

    def _script_for(self, question: str) -> list[list[dict]]:
        q = question.lower()
        if "table" in q:
            return [[{"type": "text", "text": "Reusing the prior result as a table."}]]
        if "category" in q or "composition" in q:
            sql = (
                f"SELECT category_name, ABS(SUM(base_amount)) AS total FROM {INCLUDED} "
                "WHERE NOT is_income GROUP BY category_name ORDER BY total DESC"
            )
            spec = {"chart_type": "bar",
                    "x": {"field": "category_name", "type": "nominal"},
                    "y": {"field": "total", "type": "quantitative"},
                    "title": "Spend by category"}
        elif "month" in q or "trend" in q:
            sql = (
                f"SELECT strftime(date, '%Y-%m') AS month, SUM(base_amount) AS spend "
                f"FROM {INCLUDED} WHERE NOT is_income GROUP BY month ORDER BY month"
            )
            spec = {"chart_type": "line",
                    "x": {"field": "month", "type": "temporal"},
                    "y": {"field": "spend", "type": "quantitative"},
                    "title": "Monthly spend"}
        else:
            sql = f"SELECT SUM(base_amount) AS net FROM {INCLUDED}"
            spec = {"chart_type": "metric", "y": {"field": "net", "type": "quantitative"},
                    "title": "Net cash flow"}
        return [
            [{"type": "text", "text": "Querying the data."},
             {"type": "tool_use", "id": "t1", "name": "query_finance", "input": {"sql": sql}}],
            [{"type": "tool_use", "id": "t2", "name": "create_view",
              "input": {"result_id": "__LAST__", "view_spec": spec}}],
            [{"type": "text", "text": "Here is your answer, grounded in the data."}],
        ]

    async def answer(self, question, prior_result_id, last_synced_at):  # type: ignore[override]
        self._client = FakeAnthropic(self._script_for(question))
        return await super().answer(question, prior_result_id, last_synced_at)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db = duckdb.connect(":memory:")
    init_schema(db)
    http = httpx.AsyncClient(transport=MockLM("mixed").transport())
    registry = ResultRegistry(db, LIMITS)
    lm_client = LunchMoneyClient(http, SecretStr("demo-token"), timeout=5.0)  # noqa: S106
    agent = DemoAgent(FakeAnthropic([]), db, registry, LIMITS, "demo", "usd")
    app.state.http = http
    app.state.db = db
    app.state.registry = registry
    app.state.lm_client = lm_client
    app.state.agent = agent
    try:
        yield
    finally:
        await http.aclose()
        db.close()


def build() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    for router in (sync.router, query.router, results.router, health.router):
        app.include_router(router)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    return app


app = build()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8123, log_level="warning")
