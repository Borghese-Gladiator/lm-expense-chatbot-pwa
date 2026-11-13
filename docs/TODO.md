# TODO

The work items are in order inside each section. Requirement IDs refer to [PRD.md](../PRD.md).

## Fixes from the first build

- [x] Update `.env.example`.
- [ ] Test Plaid with sandbox keys. Connect a sandbox bank, sync, and check that pending, posted, and removed rows are correct (BANK-01).
- [ ] Test Ask with a real API key. Check that the model returns a valid `AnalyticsQuery` for 10 typical questions.
- [ ] Measure report speed on 50,000 seeded transactions. The target is less than 2 seconds.

## Milestone 1: Independent foundation

- [x] **Authentication.** One shared password (`APP_PASSWORD`) on every request. Vercel Cron uses `CRON_SECRET`.
- [ ] **Account mapping.** Let the user merge a Plaid account into a migrated CSV account. Move the transactions and delete the empty account.
- [ ] **Plaid and CSV reconciliation.** Recommended approach: give each account a `history_cutover` date. Plaid skips transactions before that date, and the CSV history covers them. As a second step, match on account, amount, and a date that is within 3 days. Show the possible duplicates for review.
- [x] **Scheduled sync** (BANK-11). Vercel Cron calls `/api/cron/sync` one time each day. Upgrade to Vercel Pro for a shorter interval.
- [ ] **Plaid Link update mode** (BANK-06). For a connection with status `reconnect`, open Link with the item's access token.
- [ ] **Last sync time for each connection** (BANK-07).
- [ ] **Basic rules engine** (Feature E). Add a `rules` table with conditions (text contains, account, amount range) and actions (category, merchant, tags, reviewed). Run rules on new rows in CSV import and Plaid sync. Skip rows with `user_edited`. Add a preview endpoint and an "apply to past transactions" action. Add `rule_executions` for the audit and undo.

## Milestone 2: Spending analytics

- [ ] **Presets** (EXP-01, EXP-02). Add "Last 3 complete months", "Last 30 days", and "Last 90 days". Label each preset as rolling or calendar. Change "Last 12 months" to stop at the end of the previous month.
- [ ] **YTD comparison default** (YOY-02, YOY-03). When the preset is YTD, set the comparison to "Same period last year".
- [ ] **Year-over-year overlay chart** (YOY-04). Add a `month_of_year` dimension. Then the query `dimensions: ["month_of_year", "year"]` with a line chart shows one line for each year. The comparison logic does not need a change.
- [ ] **Category exclusion** (EXP-09). Add `exclude_category_ids` to `Filters` and an "Exclude" action on breakdown rows.
- [ ] **Category to merchant drill-down** (EXP-07). In the comparison table, a click on a category opens the same comparison grouped by merchant, with that category as a filter.
- [ ] **Explore summary cards** (EXP-10). Show total, average for each month, change, and count above the chart.

## Milestone 3: Trips

- [ ] Add `trips` and `trip_transactions (trip_id, transaction_id, amount NULL = full amount)` (TRIP-01, TRIP-09).
- [ ] Add Trips CRUD API and the Trips list page.
- [ ] Add trip suggestions. Score candidates from the date window, the pre-trip window, travel categories and merchants, the currency, and the Plaid location. Exclude categories with kind `transfer` and recurring charges.
- [ ] Add the review screen with accept or reject, one at a time or in bulk.
- [ ] Add the trip summary page. It uses the existing `AnalyticsQuery` with a trip filter.
- [ ] Add `trip` as a filter and a dimension in Explore (TRIP-12, EXP-05).
- [ ] Make sure that Plaid sync keeps trip links when a transaction changes (TRIP-08). A removed Plaid row deletes its link.

## Milestone 4: Automation and polish

- [ ] **Split API and UI.** Create child rows whose sum equals the parent amount. Validate the sum on the server.
- [ ] **Merchant normalization.** Add `merchants` and `merchant_aliases`. Apply them in import and sync. Add a merge screen in Settings.
- [ ] **Recurring items.** Detect charges with the same merchant and a similar amount at a regular interval. Let the user confirm them. Show price increases.
- [ ] **Change history.** Record each manual and rule change to a transaction.
- [ ] **Transfer matching.** Pair a money-out row and a money-in row with the same amount across two owned accounts within 3 days.
- [ ] **AND/OR rule conditions.**
- [ ] **Multi-currency.** Select an FX rate source. Store the converted amount with the rate date.
