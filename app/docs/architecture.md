# Architecture

## Layers

1. **LunchMoney client** (`app/lunchmoney/client.py`) — one shared `httpx.AsyncClient`, Bearer
   auth via `SecretStr`, 30s timeout, typed errors, 429 `Retry-After` + 5xx exponential backoff,
   offset pagination to `has_more=false`. The token is never logged and never appears in
   exception messages.
2. **Normalization** (`app/lunchmoney/normalization.py`) — parses amounts as `Decimal`, applies
   expense/income sign rules, converts to base currency (`to_base` or FX rate), unifies
   manual+plaid accounts under `manual:<id>` / `plaid:<id>` keys, hydrates category/tag names.
3. **Sync** (`app/lunchmoney/sync.py`) — snapshot pipeline: **stage → validate → replace the
   date window inside one transaction → refresh views → record `last_synced_at`**. Idempotent;
   transactions that vanished from the source within the window are dropped.
4. **DuckDB warehouse** (`app/analytics/database.py`, `semantic_views.py`) — base tables
   `analytics.transactions / accounts / categories / budgets` plus semantic views
   `transactions_visible`, `transaction_components`, `transactions_included_in_totals`,
   `budget_performance`.
5. **SQL validator** (`app/analytics/query_validator.py`) — hard gate: single statement,
   `SELECT`/`WITH` only, approved schema only, no filesystem/network/extension/mutation,
   row-limit injection. See `docs/validation.md`.
6. **Result registry** (`app/analytics/result_registry.py`) — executes validated SQL under
   limits, materializes rows, mints a `result_id`, stores the `QueryResult` and an
   `AnalysisRecord`, generates deterministic `Fact`s, and resolves relative date ranges.
7. **Analyst agent** (`app/agent/`) — a bounded tool loop with exactly three tools. The model
   generates read-only SQL, grounds prose in returned facts, and reuses `result_id` for
   "show as a table". It never sees the LunchMoney token.
8. **Visualization** (`app/visualization/`) — validates a `ViewSpec` (field existence +
   chart-type compatibility) and compiles it to Vega-Lite for
   metric/table/line/bar/grouped_bar/stacked_bar/area/scatter/donut.
9. **API + UI** (`app/api/`, `app/main.py`, `frontend/`) — FastAPI routers wired via lifespan;
   a static UI renders the `AnswerEnvelope`.

## Data flow

```mermaid
flowchart TD
    UI["Browser UI (frontend/app.js)"] -->|POST /api/query| QAPI["/api/query"]
    UI -->|POST /api/sync| SAPI["/api/sync"]

    SAPI --> SYNC["sync_snapshot"]
    SYNC --> LM["LunchMoneyClient\n(shared httpx, Bearer, retries)"]
    LM -->|raw pages| NORM["normalize_snapshot"]
    NORM --> STAGE["staging tables"]
    STAGE -->|validate + replace window (txn)| DUCK[("DuckDB\nanalytics.*")]
    DUCK --> VIEWS["semantic views\n(visible / components / included_in_totals / budget_performance)"]

    QAPI --> AGENT["AnalystAgent\n(3 tools only)"]
    AGENT -->|get_finance_catalog| CAT["FinanceCatalog\n(approved schema, sign rules, bounds)"]
    AGENT -->|query_finance(sql)| VAL["validate_sql\n(SELECT/WITH, approved, no FS/net)"]
    VAL --> REG["ResultRegistry\n(execute + result_id + facts)"]
    REG --> DUCK
    AGENT -->|create_view(result_id, spec)| VIZ["ViewSpec validate + compile\n→ Vega-Lite"]
    REG --> ENV["AnswerEnvelope\n(insight/metric/table/chart + provenance)"]
    VIZ --> ENV
    ENV --> UI

    subgraph secrets [never reaches the model]
      TOKEN["LUNCHMONEY_TOKEN (SecretStr)"]
    end
    TOKEN -.Authorization header only.-> LM
```

## Key invariants
- The Anthropic model receives the catalog, the question, and tool results — **never** the
  LunchMoney token or the Anthropic key.
- `AnswerEnvelope.provenance.sql` is the exact validated SQL that produced the answer, and
  `provenance.result_id == AnswerEnvelope.result_id`.
- Totals use `transactions_included_in_totals`, which already excludes transfers, pending, and
  explicitly-excluded rows, and uses leaf-level split components.
