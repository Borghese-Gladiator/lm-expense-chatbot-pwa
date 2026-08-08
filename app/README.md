# Finance Analyst

A single-agent personal-finance analyst. It syncs [LunchMoney](https://lunchmoney.app)
transactions into a local DuckDB warehouse, exposes a **read-only** semantic layer, and lets
an Anthropic-powered analyst answer natural-language questions by writing validated SQL and
composing an `AnswerEnvelope` of insight / metric / table / chart blocks (Vega-Lite). A minimal
browser UI renders the answers.

## Highlights
- **Read-only by construction.** The agent's only tools are `get_finance_catalog`,
  `query_finance`, and `create_view`. A hard SQL validator (see `docs/validation.md`) rejects
  anything that isn't a single `SELECT`/`WITH` over approved analytics views.
- **The model never sees the LunchMoney token.** The token is a `SecretStr`, injected only into
  the `Authorization` header, never logged, never in errors, never sent to the model.
- **Grounded insights.** Every stated number is derived from facts returned by the executor.
- **Result reuse.** "Show that chart as a table" reuses the prior `result_id` — no re-query.

## Layout
```
app/
  config.py            Settings (SecretStr token/keys, DB path, limits)
  main.py              FastAPI app factory + lifespan (shared httpx client + DuckDB + agent)
  models/              Pydantic contracts (queries, answers, domain)
  lunchmoney/          client (async, retries, redaction), sync, normalization
  analytics/           DuckDB schema, semantic views, SQL validator, result registry
  agent/               analyst loop, three restricted tools, prompts, catalog
  visualization/       ViewSpec schemas, validator, Vega-Lite compiler
  api/                 sync / query / results / health routers + deps
frontend/              static HTML/JS/CSS UI (Vega-Embed)
types/contracts.ts     TypeScript equivalents of the Pydantic contracts
docs/                  architecture, semantic-model, api-contracts, analyst-skill, validation
tests/                 unit, integration, golden (>=25 Qs), security
scripts/               manual_check.py, demo_server.py (fixture-backed, no API keys)
```

## Setup
```bash
uv venv --python 3.10
uv pip install -e ".[dev]"
cp .env.example .env   # fill in LUNCHMONEY_TOKEN + ANTHROPIC_API_KEY
```

Environment variables (`.env`):

| var | meaning | default |
|-----|---------|---------|
| `LUNCHMONEY_TOKEN` | LunchMoney access token (SecretStr) | — |
| `ANTHROPIC_API_KEY` | Anthropic API key (SecretStr) | — |
| `DUCKDB_PATH` | DuckDB file path | `finance.duckdb` |
| `HTTP_TIMEOUT_SECONDS` | shared httpx timeout | `30.0` |
| `MODEL` | Anthropic model id | `claude-3-5-sonnet-latest` |
| `BASE_CURRENCY` | base currency for `to_base` amounts | `usd` |

## Run
```bash
# real app (needs API keys)
uv run uvicorn app.main:app --reload

# fixture-backed demo (no keys) — serves the UI + mock data
PYTHONPATH=. .venv/bin/python scripts/demo_server.py   # http://127.0.0.1:8123
```

Then open the UI, click **Sync data**, and ask e.g. *"How much did I spend by category?"*.

## API
`POST /api/sync`, `POST /api/query`, `GET /api/results/{id}`, `GET /api/results/{id}/rows`,
`GET /api/health`. Full schemas in `docs/api-contracts.md` (Addendum A).

## Quality gates
```bash
.venv/bin/python -m pytest      # unit + integration + golden + security
.venv/bin/ruff check .
.venv/bin/mypy app
PYTHONPATH=. .venv/bin/python scripts/manual_check.py   # 7 acceptance Qs, reuse, security
```

## Architecture
See `docs/architecture.md` for the layered data flow and mermaid diagram.
