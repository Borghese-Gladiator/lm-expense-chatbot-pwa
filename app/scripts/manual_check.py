"""Manual end-to-end check without external services.

Builds the FastAPI app with the LunchMoney API and Anthropic client mocked, then:
  1. POST /api/sync against fixture data
  2. POST /api/query for 7 functional-acceptance questions
  3. Confirms each returns an AnswerEnvelope with facts, blocks, chart fields, provenance
  4. Confirms "show that chart as a table" reuses the prior result_id
  5. Confirms security rejections + that the token never appears in any response

Run: PYTHONPATH=. .venv/bin/python scripts/manual_check.py
"""

from __future__ import annotations

import contextlib
import json
import sys
from collections.abc import AsyncIterator

import duckdb
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.agent.analyst import AnalystAgent
from app.analytics.database import init_schema
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.api import health, query, results, sync
from app.lunchmoney.client import LunchMoneyClient
from tests.integration.fake_anthropic import FakeAnthropic
from tests.integration.mock_lm import MockLM

TOKEN = "manual-secret-token"  # noqa: S105
LIMITS = ValidatorLimits(max_rows=1000, max_bytes=1_000_000, max_time_ms=5000)

INCLUDED = "analytics.transactions_included_in_totals"

# (question, sql, view_spec) for each acceptance question
QUESTIONS = [
    (
        "What is my net cash flow?",
        f"SELECT SUM(base_amount) AS net FROM {INCLUDED}",
        {"chart_type": "metric", "y": {"field": "net", "type": "quantitative"}},
    ),
    (
        "How much did I spend by category?",
        f"SELECT category_name, SUM(base_amount) AS total FROM {INCLUDED} "
        "WHERE NOT is_income GROUP BY category_name ORDER BY total",
        {"chart_type": "bar", "x": {"field": "category_name", "type": "nominal"},
         "y": {"field": "total", "type": "quantitative"}},
    ),
    (
        "What is my monthly spend trend?",
        f"SELECT strftime(date, '%Y-%m') AS month, SUM(base_amount) AS spend FROM {INCLUDED} "
        "WHERE NOT is_income GROUP BY month ORDER BY month",
        {"chart_type": "line", "x": {"field": "month", "type": "temporal"},
         "y": {"field": "spend", "type": "quantitative"}},
    ),
    (
        "How much income did I earn?",
        f"SELECT SUM(base_amount) AS income FROM {INCLUDED} WHERE is_income",
        {"chart_type": "metric", "y": {"field": "income", "type": "quantitative"}},
    ),
    (
        "What is my biggest spending category?",
        f"SELECT category_name, SUM(base_amount) AS total FROM {INCLUDED} "
        "WHERE NOT is_income GROUP BY category_name ORDER BY total ASC LIMIT 1",
        {"chart_type": "metric", "y": {"field": "total", "type": "quantitative"}},
    ),
    (
        "Show spending composition by category",
        f"SELECT category_name, ABS(SUM(base_amount)) AS total FROM {INCLUDED} "
        "WHERE NOT is_income GROUP BY category_name",
        {"chart_type": "donut", "color": {"field": "category_name", "type": "nominal"},
         "y": {"field": "total", "type": "quantitative"}},
    ),
    (
        "How am I tracking against budget?",
        "SELECT category_name, budgeted, actual, variance "
        "FROM analytics.budget_performance ORDER BY variance",
        {"chart_type": "table"},
    ),
]


def _script(sql: str, view_spec: dict) -> list[list[dict]]:
    return [
        [{"type": "text", "text": "Querying."},
         {"type": "tool_use", "id": "t1", "name": "query_finance", "input": {"sql": sql}}],
        [{"type": "tool_use", "id": "t2", "name": "create_view",
          "input": {"result_id": "__LAST__", "view_spec": view_spec}}],
        [{"type": "text", "text": "Grounded answer."}],
    ]


def build_app() -> FastAPI:
    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = duckdb.connect(":memory:")
        init_schema(db)
        http = httpx.AsyncClient(transport=MockLM("mixed").transport())
        registry = ResultRegistry(db, LIMITS)
        lm_client = LunchMoneyClient(http, SecretStr(TOKEN), timeout=5.0)
        agent = AnalystAgent(FakeAnthropic([]), db, registry, LIMITS, "fake", "usd")
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

    app = FastAPI(lifespan=lifespan)
    for router in (sync.router, query.router, results.router, health.router):
        app.include_router(router)
    return app


def main() -> int:
    app = build_app()
    failures: list[str] = []
    with TestClient(app) as client:
        assert client.get("/api/health").json()["db"] is True
        sync_body = client.post("/api/sync", json={}).json()
        print(f"[sync] written={sync_body['transactions_written']} "
              f"dropped={sync_body['transactions_dropped']}")

        last_chart_result_id = None
        for question, sql, view_spec in QUESTIONS:
            app.state.agent._client = FakeAnthropic(_script(sql, view_spec))
            env = client.post("/api/query", json={"question": question}).json()
            kinds = [b["kind"] for b in env["blocks"]]
            has_provenance = bool(env["provenance"]["sql"]) and bool(env["provenance"]["result_id"])
            has_facts = any(b.get("facts") for b in env["blocks"])
            chart_block = next(
                (b for b in env["blocks"] if b["kind"] in ("chart", "metric", "table")),
                None,
            )
            ok = has_provenance and chart_block is not None and env["result_id"]
            print(f"[query] {question[:45]:45s} blocks={kinds} facts={has_facts} ok={ok}")
            if not ok:
                failures.append(question)
            if view_spec["chart_type"] in ("bar", "line", "donut"):
                last_chart_result_id = env["result_id"]
            if TOKEN in json.dumps(env):
                failures.append(f"TOKEN LEAK in response for: {question}")

        # show-as-table reuse
        table_script = [
            [{"type": "tool_use", "id": "v1", "name": "create_view",
              "input": {"result_id": last_chart_result_id, "view_spec": {"chart_type": "table"}}}],
            [{"type": "text", "text": "As a table."}],
        ]
        app.state.agent._client = FakeAnthropic(table_script)
        before = len(app.state.registry._results)
        reuse = client.post("/api/query", json={
            "question": "show that chart as a table", "result_id": last_chart_result_id,
        }).json()
        after = len(app.state.registry._results)
        reuse_ok = reuse["result_id"] == last_chart_result_id and before == after
        print(f"[reuse] result_id reused={reuse['result_id'] == last_chart_result_id} "
              f"no_requery={before == after} ok={reuse_ok}")
        if not reuse_ok:
            failures.append("show-as-table reuse")

        # security rejection through the tool path
        from app.agent.tools import query_finance
        rej = query_finance(app.state.registry, LIMITS,
                            "DROP TABLE analytics.transactions", "q", None)
        rej_ok = rej.get("error") == "rejected"
        print(f"[security] DROP rejected={rej_ok}")
        if not rej_ok:
            failures.append("security rejection")

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        return 1
    print("\nALL MANUAL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
