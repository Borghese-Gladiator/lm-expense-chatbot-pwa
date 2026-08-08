"""End-to-end query pipeline: agent tool loop over the reference dataset + result reuse."""

from __future__ import annotations

import pytest

from app.agent.analyst import AnalystAgent
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from tests.integration.fake_anthropic import FakeAnthropic, query_then_chart_script

pytestmark = pytest.mark.integration

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


def _agent(seeded_db, limits: ValidatorLimits, script) -> AnalystAgent:
    registry = ResultRegistry(seeded_db, limits)
    return AnalystAgent(
        FakeAnthropic(script), seeded_db, registry, limits, "fake-model", "usd"
    )


async def test_query_produces_answer_envelope_with_chart(seeded_db, limits):
    agent = _agent(seeded_db, limits, query_then_chart_script(SPEND_SQL, BAR_SPEC))
    env = await agent.answer("spend by category", None, None)

    assert env.question == "spend by category"
    kinds = [b.kind for b in env.blocks]
    assert "chart" in kinds
    chart = next(b for b in env.blocks if b.kind == "chart")
    assert chart.vega_lite is not None
    assert chart.vega_lite["encoding"]["x"]["field"] == "category_name"
    # provenance links back to the executed SQL
    assert "transactions_included_in_totals" in env.provenance.sql
    assert env.provenance.result_id == env.result_id


async def test_facts_are_grounded_in_result(seeded_db, limits):
    agent = _agent(seeded_db, limits, query_then_chart_script(SPEND_SQL, BAR_SPEC))
    env = await agent.answer("spend by category", None, None)
    insight = next(b for b in env.blocks if b.kind == "insight")
    assert insight.facts
    top = next((f for f in insight.facts if f.label == "top"), None)
    assert top is not None
    assert "Rent" in top.value  # Rent is the largest spend magnitude


async def test_show_as_table_reuses_result_id_without_requery(seeded_db, limits):
    registry = ResultRegistry(seeded_db, limits)
    agent = AnalystAgent(
        FakeAnthropic(query_then_chart_script(SPEND_SQL, BAR_SPEC)),
        seeded_db, registry, limits, "fake-model", "usd",
    )
    first = await agent.answer("spend by category", None, None)
    prior_id = first.result_id

    # second turn: only a create_view(table) referencing the prior result — no query_finance
    table_script = [
        [
            {
                "type": "tool_use",
                "id": "v1",
                "name": "create_view",
                "input": {"result_id": prior_id, "view_spec": {"chart_type": "table"}},
            }
        ],
        [{"type": "text", "text": "Shown as a table."}],
    ]
    agent2 = AnalystAgent(
        FakeAnthropic(table_script), seeded_db, registry, limits, "fake-model", "usd"
    )
    before_calls = len(registry._results)
    second = await agent2.answer("show that chart as a table", prior_id, None)
    after_calls = len(registry._results)

    assert second.result_id == prior_id
    table_block = next(b for b in second.blocks if b.kind == "table")
    assert table_block.result_id == prior_id
    # no new result materialized => source query was NOT re-run
    assert before_calls == after_calls


async def test_agent_never_receives_token(seeded_db, limits):
    fake = FakeAnthropic(query_then_chart_script(SPEND_SQL, BAR_SPEC))
    registry = ResultRegistry(seeded_db, limits)
    agent = AnalystAgent(fake, seeded_db, registry, limits, "fake-model", "usd")
    await agent.answer("spend by category", None, None)
    # inspect everything sent to the model
    blob = repr(fake.messages.calls)
    assert "Bearer" not in blob
    assert "secret" not in blob.lower()
