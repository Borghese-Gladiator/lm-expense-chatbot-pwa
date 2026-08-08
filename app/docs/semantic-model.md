# Semantic Model

## Base tables (`analytics`)

### `transactions`
| column | type | notes |
|--------|------|-------|
| `id` | BIGINT | LunchMoney transaction id (PK) |
| `date` | DATE | transaction date |
| `account_key` | VARCHAR | `manual:<id>` or `plaid:<id>` |
| `amount` | DECIMAL(18,2) | signed in original currency |
| `base_amount` | DECIMAL(18,2) | signed in base currency |
| `currency` | VARCHAR | original currency (lowercase) |
| `payee` | VARCHAR | |
| `category_id` / `category_name` | BIGINT / VARCHAR | hydrated |
| `tags` | VARCHAR[] | hydrated tag names |
| `is_transfer` | BOOLEAN | |
| `is_pending` | BOOLEAN | |
| `is_income` | BOOLEAN | |
| `excluded_from_totals` | BOOLEAN | transfer OR pending OR explicitly excluded |
| `parent_id` | BIGINT | non-null for split children |

### `accounts`
`account_key` (PK), `source` (`manual`/`plaid`), `source_id`, `name`, `currency`, `balance`.

### `categories`
`id`, `name`.

### `budgets` (internal; surfaced via the `budget_performance` view)
`category_id`, `category_name`, `period_start`, `budgeted`, `actual`.

## Semantic views (what the agent queries)

| view | definition | use |
|------|------------|-----|
| `transactions_visible` | `transactions` where `parent_id IS NULL` | user-facing rows (split parents kept, children hidden) |
| `transaction_components` | `transactions` minus any row that is a parent of a split | leaf-level rows: split children expanded, parents removed |
| `transactions_included_in_totals` | `transaction_components` where NOT excluded, NOT transfer, NOT pending | **spend/income/net totals** |
| `budget_performance` | `budgets` + `(actual - budgeted) AS variance` | budget tracking |

## Sign rules
- Expenses are **negative**, income is **positive**.
- `SUM(base_amount)` over `transactions_included_in_totals` = **net cash flow**.
- Spend = `SUM(base_amount) WHERE NOT is_income` (a negative number).
- Income = `SUM(base_amount) WHERE is_income` (a positive number).

## Base currency
- `BASE_CURRENCY` (default `usd`). Amounts already in base currency pass through unchanged.
- For foreign currency, `base_amount` uses LunchMoney's `to_base` when present, otherwise the
  snapshot FX rate. Parsing is `Decimal`-based to avoid float error.

## Account unification
Manual (asset) and Plaid accounts are merged into one `accounts` table keyed by
`manual:<id>` / `plaid:<id>`. A transaction's account is resolved from `plaid_account_id`
(preferred) or `asset_id`.

## Exclusion & splits (worked example)
Given 10 raw rows — 2 income, 5 normal expenses, 1 transfer, 1 pending, 1 excluded — the
`transactions_included_in_totals` view yields **7** rows. In the reference dataset that is:
income `+5000`, spend `-1488`, net `+3512`.
