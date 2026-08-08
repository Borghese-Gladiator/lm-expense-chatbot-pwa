# API Contracts — Addendum A

All request/response bodies are JSON. Types mirror `app/models/` and `types/contracts.ts`.

## Shared types

### DateRange
```json
{ "start": "2024-01-01", "end": "2024-01-31" }
```

### Provenance
```json
{
  "sql": "SELECT ...",
  "row_count": 3,
  "date_range": { "start": "2024-01-01", "end": "2024-01-31" } | null,
  "last_synced_at": "2026-08-08T19:00:00Z" | null,
  "result_id": "hex"
}
```

### Fact
```json
{ "label": "net", "value": "3,512.00", "raw_value": 3512.0, "unit": null }
```

### Encoding / ViewSpec
```json
{ "field": "total", "type": "quantitative", "aggregate": null }
```
```json
{
  "chart_type": "bar",
  "x": { "field": "category_name", "type": "nominal" },
  "y": { "field": "total", "type": "quantitative" },
  "color": null,
  "title": "Spend by category"
}
```
`chart_type` ∈ `metric | table | line | bar | grouped_bar | stacked_bar | area | scatter | donut`.

### AnswerBlock
```json
{
  "kind": "insight | metric | table | chart",
  "text": "string | null",
  "facts": [Fact] | null,
  "view_spec": ViewSpec | null,
  "vega_lite": { } | null,
  "result_id": "string | null"
}
```

## Endpoints

### `POST /api/sync`
Request:
```json
{ "start": "2024-01-01" | null, "end": "2024-12-31" | null }
```
Defaults: `end` = today, `start` = today − 365 days. Response `SyncResult`:
```json
{
  "synced": true,
  "transactions_written": 10,
  "transactions_dropped": 0,
  "date_range": { "start": "2024-01-01", "end": "2024-12-31" },
  "last_synced_at": "2026-08-08T19:00:00Z"
}
```
Errors: `422` (bad window / malformed snapshot), `502` (upstream LunchMoney error, token redacted).

### `POST /api/query`
Request `QueryRequest`:
```json
{ "question": "How much did I spend by category?", "result_id": "prior-id | null" }
```
When `result_id` is supplied (e.g. "show that chart as a table"), the agent reuses it instead
of re-running the source query. Response `AnswerEnvelope`:
```json
{
  "question": "How much did I spend by category?",
  "blocks": [ AnswerBlock, ... ],
  "provenance": Provenance,
  "result_id": "hex"
}
```
Errors: `422` (no result produced), `422` (empty question fails validation).

### `GET /api/results/{result_id}`
Returns the stored `QueryResult` (inline when small, preview-truncated when large).
`404` if unknown. Response `QueryResult`:
```json
{
  "result_id": "hex",
  "columns": ["category_name", "total"],
  "column_types": ["VARCHAR", "DECIMAL(18,2)"],
  "rows": [["Rent", 1200.0], ["Groceries", 210.0]],
  "row_count": 3,
  "truncated": false,
  "provenance": Provenance
}
```

### `GET /api/results/{result_id}/rows?offset=0&limit=100`
Pages rows of a stored result. `offset >= 0`, `1 <= limit <= 1000`. `404` if unknown.

### `GET /api/health`
```json
{ "status": "ok", "db": true, "transaction_count": 10, "last_synced_at": "..." | null }
```
