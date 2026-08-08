# SQL Validation & Security

`app/analytics/query_validator.py` is the hard gate between the model and DuckDB. SQL is
validated **before** execution; on any failure a `ValidationError` is raised and the SQL is
never run.

## Rules
1. **Dangerous-construct scan** (regex, pre-parse): rejects `read_csv`, `read_parquet`,
   `read_json`, `glob`, `httpfs`, `install`, `load`, `copy`, `pragma`, `attach`, `export`,
   `import`, `call`. This blocks filesystem/network/extension access outright.
2. **Single statement.** `sqlglot.parse` must yield exactly one statement — stacked queries
   like `SELECT ...; DROP ...` are rejected.
3. **Read-only.** The top-level node must be `SELECT` / `WITH` (or a `UNION` of selects). Any
   `INSERT / UPDATE / DELETE / CREATE / DROP / ALTER / MERGE / Command` anywhere in the tree is
   rejected (`Command` covers `TRUNCATE`, `PRAGMA`, `SET`, etc.).
4. **Approved schema only.** Every referenced table must be an approved analytics object:
   `transactions, accounts, categories, budget_performance, transactions_visible,
   transaction_components, transactions_included_in_totals`. Any other schema (e.g.
   `information_schema`, `other_schema`) or table is rejected. CTE aliases are exempt.
5. **Limits.** A `LIMIT max_rows` is injected when absent, and an oversized user `LIMIT` is
   capped. The executor further truncates to `max_rows` and flags `truncated`.
   `ValidatorLimits` also carries `max_bytes` / `max_time_ms` ceilings.

## Rejection matrix (tested)

| input | outcome |
|-------|---------|
| `INSERT / UPDATE / DELETE / DROP / CREATE / ALTER / TRUNCATE` | rejected (read-only / dangerous) |
| `SELECT 1; SELECT 2` | rejected (multiple statements) |
| `SELECT ...; DROP TABLE ...` | rejected (multiple statements) |
| `SELECT * FROM secret_table` | rejected (table not approved) |
| `SELECT * FROM information_schema.tables` | rejected (not approved) |
| `read_csv / read_parquet / glob` | rejected (dangerous) |
| `INSTALL / LOAD / COPY / PRAGMA / ATTACH` | rejected (dangerous) |
| `SELECT ... LIMIT 999999` | accepted, capped to `max_rows` |
| valid `SELECT` / `WITH` over approved views | accepted, `LIMIT` ensured |

Coverage: `tests/unit/test_query_validator.py`, `tests/security/test_tool_rejections.py`.

## Token safety
- `LUNCHMONEY_TOKEN` / `ANTHROPIC_API_KEY` are `SecretStr`; their `repr`/`str` are masked.
- The token is injected only into the LunchMoney `Authorization` header.
- LunchMoney client errors carry redacted messages (path + status, never the token).
- Assertions in `tests/security/test_token_leak.py` confirm the token never appears in agent
  messages, API responses, stored `AnalysisRecord`s, `SyncResult`, logs, or error strings.
