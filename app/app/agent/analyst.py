"""Single analyst agent: a bounded tool loop over the three restricted tools.

The agent never sees the LunchMoney token. It can only call get_finance_catalog,
query_finance, and create_view. Insight text is grounded in facts returned by
query_finance. When a prior result_id is supplied, create_view reuses it rather than
re-running the source query.
"""

from __future__ import annotations

import datetime
from typing import Any

import duckdb

from app.agent.catalog import build_catalog
from app.agent.prompts import render_catalog, system_prompt
from app.agent.tools import (
    create_view,
    get_finance_catalog,
    query_finance,
    tool_specs,
)
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry, generate_facts
from app.models.answers import AnswerBlock, Fact, ViewSpec
from app.models.queries import AnswerEnvelope, DateRange, QueryResult

MAX_TURNS = 8


def build_answer_envelope(
    question: str,
    result: QueryResult,
    facts: list[Fact],
    view_spec: ViewSpec | None,
    vega_lite: dict[str, Any] | None,
    insight: str,
) -> AnswerEnvelope:
    blocks: list[AnswerBlock] = []
    if insight:
        blocks.append(AnswerBlock(kind="insight", text=insight, facts=facts))

    if view_spec is not None:
        if view_spec.chart_type.value == "metric":
            blocks.append(
                AnswerBlock(kind="metric", facts=facts, view_spec=view_spec,
                            vega_lite=vega_lite, result_id=result.result_id)
            )
        elif view_spec.chart_type.value == "table":
            blocks.append(
                AnswerBlock(kind="table", view_spec=view_spec, vega_lite=vega_lite,
                            result_id=result.result_id)
            )
        else:
            blocks.append(
                AnswerBlock(kind="chart", view_spec=view_spec, vega_lite=vega_lite,
                            result_id=result.result_id)
            )
    else:
        blocks.append(AnswerBlock(kind="table", result_id=result.result_id))

    return AnswerEnvelope(
        question=question,
        blocks=blocks,
        provenance=result.provenance,
        result_id=result.result_id,
    )


class AnalystAgent:
    def __init__(
        self,
        anthropic_client: Any,
        db: duckdb.DuckDBPyConnection,
        registry: ResultRegistry,
        limits: ValidatorLimits,
        model: str,
        base_currency: str,
    ) -> None:
        self._client = anthropic_client
        self._db = db
        self._registry = registry
        self._limits = limits
        self._model = model
        self._base_currency = base_currency

    def _dispatch_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        question: str,
        date_range: DateRange | None,
        last_synced_at: datetime.datetime | None,
    ) -> dict[str, Any]:
        if name == "get_finance_catalog":
            return get_finance_catalog(self._db, self._base_currency, last_synced_at)
        if name == "query_finance":
            return query_finance(
                self._registry,
                self._limits,
                arguments["sql"],
                question,
                date_range,
                last_synced_at,
            )
        if name == "create_view":
            return create_view(
                self._registry, arguments["result_id"], arguments["view_spec"]
            )
        return {"error": "unknown_tool", "reason": f"tool not available: {name}"}

    async def answer(
        self,
        question: str,
        prior_result_id: str | None,
        last_synced_at: datetime.datetime | None,
    ) -> AnswerEnvelope:
        from app.analytics.result_registry import resolve_date_range

        catalog = build_catalog(self._db, self._base_currency, last_synced_at)
        date_range = resolve_date_range(
            question, datetime.date.today(), catalog.date_bounds
        )
        system = system_prompt(render_catalog(catalog))

        user_content = question
        if prior_result_id:
            user_content = (
                f"{question}\n\n(A prior result is available: result_id="
                f"{prior_result_id}. If this asks to show it as a table/chart, reuse that "
                f"result_id with create_view; do not re-run the source query.)"
            )

        messages: list[dict[str, Any]] = [{"role": "user", "content": user_content}]

        last_result_id: str | None = None
        last_view_spec: ViewSpec | None = None
        last_vega: dict[str, Any] | None = None
        insight_text = ""

        for _ in range(MAX_TURNS):
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=system,
                tools=tool_specs(),
                messages=messages,
            )

            assistant_blocks: list[dict[str, Any]] = []
            tool_results: list[dict[str, Any]] = []
            text_parts: list[str] = []

            for block in response.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    text_parts.append(block.text)
                    assistant_blocks.append({"type": "text", "text": block.text})
                elif btype == "tool_use":
                    assistant_blocks.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }
                    )
                    result = self._dispatch_tool(
                        block.name, dict(block.input), question, date_range, last_synced_at
                    )
                    if block.name == "query_finance" and "result_id" in result:
                        last_result_id = result["result_id"]
                    if block.name == "create_view" and "result_id" in result:
                        last_result_id = result["result_id"]
                        last_view_spec = ViewSpec.model_validate(result["view_spec"])
                        last_vega = result["vega_lite"]
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": _json_safe(result),
                        }
                    )

            if text_parts:
                insight_text = " ".join(p.strip() for p in text_parts if p.strip())

            messages.append({"role": "assistant", "content": assistant_blocks})

            if not tool_results:
                break
            messages.append({"role": "user", "content": tool_results})

        if last_result_id is None:
            if prior_result_id is not None:
                last_result_id = prior_result_id
            else:
                raise RuntimeError("agent produced no query result")

        final_result = self._registry.get_full(last_result_id)
        facts = generate_facts(final_result, last_view_spec)
        return build_answer_envelope(
            question, final_result, facts, last_view_spec, last_vega, insight_text
        )


def _json_safe(value: Any) -> str:
    import json

    def default(o: Any) -> Any:
        if isinstance(o, datetime.date):
            return o.isoformat()
        return str(o)

    return json.dumps(value, default=default)


__all__ = ["AnalystAgent", "build_answer_envelope"]
