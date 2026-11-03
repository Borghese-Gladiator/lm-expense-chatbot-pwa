"""Natural language -> AnalyticsQuery. Only names (no transactions) go to the model."""

from __future__ import annotations

import datetime

import anthropic
import duckdb
from pydantic import BaseModel

from app.analytics import AnalyticsQuery
from app.config import Settings
from app.db import rows


class AskResult(BaseModel):
    query: AnalyticsQuery
    explanation: str


SYSTEM = """You turn personal-finance questions into an AnalyticsQuery for a reporting engine.
You never see transactions. You only choose measures, dimensions, filters and comparisons.

Rules:
- "spending" is money out (expenses minus refunds). "income" is income. "net" is income minus spending.
- Transfers are never counted. Do not try to filter them out.
- Resolve relative dates ("last month", "this year", "last 6 months") against today's date.
- For "why did X change" or "compare" questions, set compare and leave time dimensions out.
- Use category_ids / account_ids from the catalog. Use exact merchant, group and tag names.
- Use the explanation to say, in one or two sentences, what the query shows and any assumption."""


def _catalog(db: duckdb.DuckDBPyConnection) -> str:
    cats = rows(db, "SELECT id, name, group_name FROM categories WHERE NOT archived ORDER BY name")
    accts = rows(db, "SELECT id, name FROM accounts WHERE NOT archived ORDER BY name")
    tags = rows(db, "SELECT DISTINCT unnest(tags) AS t FROM transactions ORDER BY t")
    merchants = rows(
        db,
        "SELECT merchant FROM reportable GROUP BY merchant ORDER BY COUNT(*) DESC LIMIT 200",
    )
    bounds = rows(db, "SELECT MIN(date) AS lo, MAX(date) AS hi FROM transactions")[0]
    return "\n".join(
        [
            f"Today: {datetime.date.today().isoformat()}",
            f"Data covers: {bounds['lo']} to {bounds['hi']}",
            "Categories (id: name [group]): "
            + "; ".join(f"{c['id']}: {c['name']} [{c['group_name'] or '-'}]" for c in cats),
            "Accounts (id: name): " + "; ".join(f"{a['id']}: {a['name']}" for a in accts),
            "Tags: " + ", ".join(t["t"] for t in tags),
            "Top merchants: " + ", ".join(m["merchant"] for m in merchants),
        ]
    )


def ask(db: duckdb.DuckDBPyConnection, settings: Settings, question: str) -> AskResult:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key.get_secret_value())
    response = client.messages.parse(
        model=settings.model,
        max_tokens=16000,
        output_config={"effort": "low"},
        system=[
            {"type": "text", "text": SYSTEM},
            {"type": "text", "text": _catalog(db)},
        ],
        messages=[{"role": "user", "content": question}],
        output_format=AskResult,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise ValueError("the model could not build a query for that question")
    return response.parsed_output
