# Analyst Skill

The analyst is a **single agent** with exactly three tools. It never sees the LunchMoney token
or the Anthropic key, and it can only read approved analytics views.

## Tools

### `get_finance_catalog()`
Returns the read-only catalog: approved tables/views + their columns, sign rules, base currency,
and the data date bounds. The agent is expected to call this first.

### `query_finance(sql)`
Validates then executes a single read-only SQL query. On success returns
`{ result_id, columns, column_types, preview_rows, row_count, truncated, facts }`.
On rejection returns `{ error: "rejected", reason }` and **nothing is executed**. See
`docs/validation.md` for the rejection rules.

### `create_view(result_id, view_spec)`
Attaches a `ViewSpec` to an existing `result_id` and compiles it to Vega-Lite. Returns
`{ result_id, view_spec, vega_lite }`, or an error for an unknown `result_id` / invalid spec.
This is the reuse path — "show that chart as a table" calls `create_view` on the prior
`result_id` **without** re-querying.

## Grounding rules (system prompt)
1. Only read-only SQL (`SELECT`/`WITH`). Anything else is rejected by the validator.
2. Use `transactions_included_in_totals` for spend/income/net; use `transactions_visible` /
   `transaction_components` only when row-level detail is explicitly requested.
3. Every stated number must come from `query_finance` facts — no invented figures.
4. Reuse `result_id` for "show as a table/chart".
5. Pick the chart: metric (single KPI), line/area (time series), bar/grouped_bar/stacked_bar
   (categorical), donut (composition), scatter (correlation), table (row detail).

## Loop
`AnalystAgent.answer()` runs a bounded loop (`MAX_TURNS`). Each model turn may emit text and
tool calls; tool calls are dispatched only to the three tools above. The final `AnswerEnvelope`
is assembled from the last materialized result: an insight block (prose + grounded facts) plus a
metric/table/chart block, with `provenance` linking back to the executed SQL.

## Result reuse contract
- First question → `query_finance` mints `result_id` A; the envelope's `result_id` is A.
- "Show that chart as a table" with `result_id=A` → the agent calls
  `create_view(A, {chart_type: "table"})`; no new result is created; the new envelope's
  `result_id` is still A. Verified by `tests/integration/test_query_pipeline.py` and
  `tests/integration/test_api.py`.
