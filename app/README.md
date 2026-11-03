# Ledgerlens

A standalone, analytics-first personal finance app. It has no budgets. It focuses on transactions you can explain:
every number opens the transactions behind it.

- **Data in:** Plaid bank sync, CSV import (including the Lunch Money export), and manual entry. The app does not depend on another finance app.
- **Analysis:** Overview, the Explore query builder (measure × metric × up to 2 dimensions × filters × period comparison), drill-down, one-off exclusion, and saved analyses.
- **Organization:** search, inline and bulk edits, categories with groups and kinds, tags, notes, a reviewed flag, and CSV export.
- **Ask (optional):** a question in plain language becomes a structured query that you can check and change. The model gets names only (categories, accounts, tags, merchants), never transactions.

## Stack

FastAPI + DuckDB (one local file) for the backend. React + Vite + ECharts for the frontend.

```
app/
  db.py          schema + `reportable` view (split parents removed, names joined)
  analytics.py   AnalyticsQuery -> parameterized SQL, comparison, drill-down
  csv_import.py  header aliases, debit/credit columns, idempotent dedupe
  plaid.py       Link, token exchange, cursor /transactions/sync
  crypto.py      Fernet encryption for Plaid access tokens
  ask.py         question -> AnalyticsQuery (structured output)
  main.py        all API routes + serves frontend/dist
frontend/src/    pages: Overview, Explore, Transactions, Accounts, Settings
tests/           analytics semantics, CSV import, Plaid sync, API
scripts/         seed_demo.py, manual_check.py
```

## Setup

```bash
uv sync --extra dev
npm install --prefix frontend
npm run build --prefix frontend
```

Configure with environment variables or a `.env` file:

| Variable | Use | Default |
|---|---|---|
| `DUCKDB_PATH` | Database file | `finance.duckdb` |
| `CURRENCY` | Reporting currency | `USD` |
| `APP_SECRET_KEY` | Encrypts bank tokens (16+ characters). Do not change it after you connect a bank. | — |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid keys | — |
| `PLAID_ENV` | `sandbox` or `production` | `sandbox` |
| `ANTHROPIC_API_KEY` | Turns on Ask | — |
| `MODEL` | Model for Ask | `claude-opus-5-5` |

## Run

```bash
uv run python scripts/seed_demo.py demo.duckdb        # optional: 2 years of fake data
DUCKDB_PATH=demo.duckdb uv run uvicorn app.main:app   # http://127.0.0.1:8000
```

For frontend development, run `npm run dev --prefix frontend`. Vite sends `/api` requests to port 8000.

To move from Lunch Money, export your transactions as CSV in Lunch Money. Then import the file on the Accounts page. The import creates accounts, categories, and groups by name. A second import of the same file adds nothing.

## How totals work

- A negative amount is money out. **Spending** is expenses with the sign flipped, so a refund reduces spending.
- **Transfers** and **adjustments** never count toward spending, income, or net. A category's kind sets the type, and a type that you set on a transaction wins.
- **Pending** transactions and categories marked "exclude" are left out unless you include them.
- When a transaction is split, only the child rows count, so the parent is not counted two times.
- **Previous period** for a full calendar month (or a run of full months) is the same number of calendar months before it. For any other range, it is a range of the same length that ends the day before.

## Checks

```bash
uv run pytest
uv run ruff check app tests
uv run mypy app
npm run check-types --prefix frontend
PYTHONPATH=. uv run python scripts/manual_check.py
```
