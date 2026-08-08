# Plan: LunchMoney Finance Analyst (FastAPI + DuckDB + Anthropic agent)

## Brief
Greenfield FastAPI app that syncs LunchMoney transactions into DuckDB, exposes a single
analyst agent (Anthropic tool-use) that writes only read-only SQL against approved semantic
views, materializes results by `result_id`, and returns an `AnswerEnvelope` of
insight/metric/table/chart blocks (Vega-Lite). Includes a browser UI, fixtures, docs, and a
full test suite. `pytest`, `ruff check .`, and `mypy app` must all pass.

## Changes (layers)
1. Scaffold: `pyproject.toml` (fastapi, uvicorn, httpx, duckdb, pydantic, pydantic-settings,
   anthropic; ruff + mypy config), `app/config.py`.
2. Models: `app/models/{queries,answers}.py` + `types/contracts.ts`.
3. LunchMoney: `app/lunchmoney/{client,sync,normalization}.py`.
4. Analytics: `app/analytics/{database,semantic_views,query_validator,result_registry}.py`.
5. Agent: `app/agent/{analyst,tools,prompts}.py`.
6. Visualization: `app/visualization/{schemas,validator,compiler}.py`.
7. API: `app/api/{deps,query,results,sync,health}.py` + `app/main.py`.
8. Frontend: `frontend/{index.html,app.js,styles.css}`.
9. Fixtures: `tests/fixtures/{lunchmoney_responses,reference_dataset}.py`.
10. Docs: `README.md`, `docs/{architecture,semantic-model,api-contracts,analyst-skill,validation}.md`.

## Tests
### unit
- normalization: amount/sign/base-currency/account unification/hydration
- date_ranges: relative phrase resolution
- semantic_views: transfer/pending/excluded exclusion
- query_validator: accept SELECT/WITH; reject INSERT/UPDATE/DELETE/DDL, multi-stmt,
  non-approved schema, filesystem/network, limit breaches
- result_registry: result_id reuse, inline/preview, fact generation
- visualization: chart selection, ViewSpec validation, Vega-Lite compile
### integration
- sync_pipeline: pagination/retries/dup sync/malformed/empty
- query_pipeline: end-to-end query over reference dataset + result reuse
### golden
- >=25 question specs -> expected result_shape/filters/view
### security
- token never in responses/logs/stored analysis

## Manual (python script + uvicorn)
- POST /api/sync against fixtures, POST /api/query for 7 acceptance Qs, confirm AnswerEnvelope
- "show as a table" reuses result_id (no re-run)
- security rejections + token-leak grep
- browser UI renders chart/table/metric blocks
