# Plan: Standalone analytics-first finance app (PRD Phase 0 + Phase 1)

## Brief
Change the repo from a Lunch Money companion into a standalone product. The app owns all
financial data in DuckDB. Data comes from three sources: Plaid (bank sync), CSV import, and
manual entry. The CSV importer also migrates Lunch Money history from its CSV export. The app
does not call the Lunch Money API.

One structured analytics query (`AnalyticsQuery`) compiles to parameterized SQL. The Overview,
Explore, comparison, drill-down, saved queries, and the AI agent all use it. The AI agent
changes: it returns an `AnalyticsQuery` for the user to review. It does not write SQL. It
receives category and account names only, never transactions.

Stack: FastAPI + DuckDB (backend), React + Vite + TypeScript + ECharts (frontend).
Deployment: single user.

## Changes

### Delete
- `app/lunchmoney/` (Lunch Money API client, sync, normalization).
- `app/agent/{catalog,tools}.py`, `app/analytics/{query_validator,result_registry}.py`,
  `app/visualization/`, `app/api/{query,results,sync}.py`, `app/models/{answers,queries}.py`.
- `budget_performance` view and the `budgets` table (PRD non-goal).
- Old `frontend/`, `types/contracts.ts`, `docs/`, old tests, old scripts.
- `sqlglot` dependency.

### Backend
1. `app/db.py`: schema. Tables: `accounts`, `categories` (with `group_name`, `is_income`,
   `exclude_from_totals`, `archived`), `transactions`, `plaid_items`, `sync_runs`,
   `saved_queries`. A view `reportable` holds leaf rows (a split parent with children is
   removed) with category and account names.
2. Transaction fields: `id`, `source` (`plaid`/`csv`/`manual`), `source_id` (unique with
   `source`), `account_id`, `date`, `amount` (negative = money out), `currency`,
   `payee_raw`, `merchant`, `category_id`, `tags[]`, `notes`,
   `type` (`income`/`expense`/`transfer`/`adjustment`), `is_pending`, `reviewed`,
   `user_edited`, `parent_id`, `raw` (JSON source record), `created_at`, `updated_at`.
   Each category has a `kind` (`expense`/`income`/`transfer`). A transaction gets its
   `type` from its category kind, unless the user sets the type. A refund is a positive
   expense, so it reduces spending. Reports use one currency. FX conversion is deferred.
3. `app/crypto.py`: Fernet encryption for Plaid access tokens. The key comes from
   `APP_SECRET_KEY`. Adds the `cryptography` dependency.
4. `app/ingest/csv_import.py`: the request body is JSON with the CSV text (no multipart
   dependency). Header aliases cover the Lunch Money export and generic bank files, including
   debit/credit columns. A sign option is available. An `account` column creates accounts by
   name. Categories are created by name. The dedupe key is the source `id` column, or a hash
   of the row fields + the occurrence index. A second import of the same file adds 0 rows.
5. `app/ingest/plaid.py`: httpx client for `/link/token/create`,
   `/item/public_token/exchange`, `/accounts/get`, `/transactions/sync`. The cursor sync
   handles added, modified, and removed rows. A modified row keeps the user edits when
   `user_edited` is true. Each run writes to `sync_runs`. Plaid
   `personal_finance_category` maps to the category and the type (TRANSFER_*, LOAN_PAYMENTS
   → transfer, INCOME → income).
6. `app/analytics/query.py`: the `AnalyticsQuery` model and the compiler.
   - Measures: `spending` (expense rows, sign flipped), `income`, `net`. Transfers never count.
   - Metrics: `total`, `count`, `avg`, `median`, `pct_of_total`, `cumulative`.
   - Dimensions (0–2): `day`, `week`, `month`, `quarter`, `year`, `category`,
     `category_group`, `merchant`, `account`, `tag`, `type`, `day_of_week`, `weekend`.
   - Filters: date range, accounts, categories, groups, merchants, tags, amount range, text
     search, `include_pending` (default false), `exclude_ids`. Values in one field use OR.
     Fields use AND.
   - Compare: a second period. Output: previous, current, diff, percent, contribution.
   - Drill-down: filters + dimension values → contributing transactions.
7. `app/api/`: routers for `accounts`, `categories`, `transactions` (search, create, patch,
   delete, export CSV), `import`, `plaid`, `analytics` (query, compare, drilldown),
   `saved_queries`, `ask` (agent), `health`.
8. `app/agent/analyst.py`: one Anthropic call with a forced tool whose input schema is the
   `AnalyticsQuery` JSON schema. It returns `{query, explanation}`. It returns 503 when
   there is no API key.

### Frontend (`frontend/`, Vite)
- Pages: Overview, Explore, Transactions, Accounts, Settings. Navigation uses the URL hash.
- Overview: KPI cards versus the previous period, monthly trend, categories, top merchants,
  largest transactions. A click on a chart opens the drill-down.
- Explore: query builder (measure, metric, dimensions, filters, compare), chart or table
  toggle, drill-down, save or load queries, and an "Ask" box that loads the agent query into
  the builder.
- Transactions: search, filters, server pagination, inline edit (category, merchant, tags,
  notes, type, reviewed), manual add, CSV export.
- Accounts: Plaid Link connect, sync button, sync run history, manual account, CSV import.
- Settings: categories (create, rename, group, flags, archive), delete all data.
- FastAPI serves `frontend/dist`. Vite proxies `/api` in development.

### Deferred (Phase 2+)
Rules engine, split UI, recurring detection, custom dashboards, merchant alias table, FX
rates, nested AND/OR filter groups.

## Tests

### Unit (`pytest`)
- `test_csv_import.py`: header aliases, sign option, re-import dedupe, identical rows on the
  same day are both kept, a bad row gives an error with the row number.
- `test_plaid_sync.py` (`httpx.MockTransport`): added/modified/removed rows, cursor saved,
  user edit kept, pending replaced by posted, a failed run is written to `sync_runs`.
- `test_query.py`: transfers excluded, split parents not counted twice, pending excluded by
  default, refunds reduce spending, group by month/category/tag, median, pct_of_total,
  cumulative, compare contributions sum to the total change, drill-down sum equals the
  aggregate, exclude_ids recalculates.
- `test_api.py` (`TestClient`): account + manual transaction + patch + search + export,
  saved queries, the Plaid access token never appears in responses.

### Manual
- Backend: `scripts/manual_check.py` seeds demo data, imports a CSV twice, runs the analytics
  endpoints, and prints the results.
- Frontend (run `scripts/seed_demo.py`, then `uv run uvicorn app.main:app`, then open
  http://127.0.0.1:8000):
  1. Open Overview. Make sure that the KPI cards and charts show data.
  2. Click a category bar. Make sure that the drill-down lists transactions with the same sum.
  3. Open Explore. Set measure Spending, dimension Month + Category, compare to the previous
     period. Make sure that the contribution column shows.
  4. Exclude one transaction from the drill-down. Make sure that the totals change.
  5. Save the query. Reload the page. Load the query.
  6. Open Transactions. Edit a category. Make sure that Overview changes.
  7. Open Accounts. Import a CSV file two times. Make sure that the second import adds 0 rows.
  8. With Plaid sandbox keys set, connect a sandbox bank and click Sync.
