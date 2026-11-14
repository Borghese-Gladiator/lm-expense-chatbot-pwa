# TODO

The work items are in order inside each section. Requirement IDs refer to [PRD.md](archive/PRD.md).

## Fixes from the first build

- [ ] Test Plaid with sandbox keys. Connect a sandbox bank, sync, and check that pending, posted, and removed rows are correct (BANK-01).
- [ ] Test Ask with a real API key. Check that the model returns a valid `AnalyticsQuery` for 10 typical questions.
- [x] Measure report speed on 50,000 seeded transactions. The target is less than 2 seconds.

## Milestone 1: Independent foundation

- [ ] **Account mapping.** Let the user merge a Plaid account into a migrated CSV account. Move the transactions and delete the empty account.
- [ ] **Plaid and CSV reconciliation.** Recommended approach: give each account a `history_cutover` date. Plaid skips transactions before that date, and the CSV history covers them. As a second step, match on account, amount, and a date that is within 3 days. Show the possible duplicates for review.
- [ ] **Plaid Link update mode** (BANK-06). For a connection with status `reconnect`, open Link with the item's access token.
- [ ] **Last sync time for each connection** (BANK-07).
- [ ] **Basic rules engine** (Feature E). Add a `rules` table with conditions (text contains, account, amount range) and actions (category, merchant, tags, reviewed). Run rules on new rows in CSV import and Plaid sync. Skip rows with `user_edited`. Add a preview endpoint and an "apply to past transactions" action. Add `rule_executions` for the audit and undo.

## Milestone 2: Convert the UI to Mantine

The goal is the same features on Mantine components, with no new features. At the end, `styles.css` and the hand-built components are gone.

- [x] **Add Mantine.** Install `@mantine/core`, `@mantine/hooks`, and `@mantine/dates`. Add `MantineProvider` and `ColorSchemeScript` in `layout.tsx`. Set the theme (primary color, font, radius). Use the Mantine automatic color scheme for dark mode.
- [x] **Layout and navigation.** Replace the `nav` in `App.tsx` with `AppShell`. Show a header with a burger menu on small screens and a navbar on large screens. Keep hash routing.
- [x] **Shared components.** Replace `Status` with `Loader` and `Alert`. Replace `TxnTable` with `Table`. Replace `DrillDrawer` and `TxnDetail` with `Drawer`. Keep `Amount` as a small wrapper on `Text`.
- [x] **Convert each page.** Do one page in each commit: Overview, Transactions, Accounts, Settings, Explore. Use `Select`, `MultiSelect`, `TextInput`, `NumberInput`, `Button`, `Card`, `Tabs`, and `Modal`. Use `DatePickerInput` with `type="range"` for the custom date range in Explore.
- [x] **Notifications.** Add `@mantine/notifications` for save, import, and sync results. Remove inline success and error text where a notification is more clear.
- [x] **Charts.** Keep ECharts. Make the chart colors follow the Mantine theme and the color scheme.
- [x] **Clean up.** Delete `styles.css` and the unused components. Check that each page works in light mode and in dark mode.

## Milestone 3: Usability

- [x] **Cookie login page.** Replace HTTP Basic auth with a `/login` page that uses the Mantine `PasswordInput`. Keep one shared password (`APP_PASSWORD`) and no user name. A `POST /api/login` route checks the password and sets a signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie with an expiry date (for example 30 days). Add a sign-out action that clears the cookie. A request without a valid cookie goes to `/login`, and an API request gets a 401. Keep the `CRON_SECRET` path as it is. Keep the 503 on Vercel when `APP_PASSWORD` is not set. Update the tests in `tests/api.test.ts`.
- [ ] **UI/UX design pass.** Review each page for layout, spacing, empty states, and loading states. Make one list of fixes, and then do them.
- [x] **Manifest and favicon.** Add `src/app/manifest.ts` (native in Next.js), 192 px and 512 px icons, an Apple touch icon, and a favicon. Replace the inline SVG icon in `layout.tsx`. Delete the old `app/public/sw.js`.
- [ ] **Mobile support.** Make each page work at 375 px width. Make tables scroll or stack on small screens. Make drawers full screen on phones. Test on iOS Safari and Android Chrome.
- [ ] **PWA.** Make the app installable to the home screen, with `display: "standalone"`. Check that the login cookie works in the installed app. Add a service worker only if offline use is needed. Do not cache `/api/` responses, because they contain bank data.

## Milestone 4: Spending analytics

- [ ] **Presets** (EXP-01, EXP-02). Add "Last 3 complete months", "Last 30 days", and "Last 90 days". Label each preset as rolling or calendar. Change "Last 12 months" to stop at the end of the previous month.
- [ ] **YTD comparison default** (YOY-02, YOY-03). When the preset is YTD, set the comparison to "Same period last year".
- [ ] **Year-over-year overlay chart** (YOY-04). Add a `month_of_year` dimension. Then the query `dimensions: ["month_of_year", "year"]` with a line chart shows one line for each year. The comparison logic does not need a change.
- [ ] **Category exclusion** (EXP-09). Add `exclude_category_ids` to `Filters` and an "Exclude" action on breakdown rows.
- [ ] **Category to merchant drill-down** (EXP-07). In the comparison table, a click on a category opens the same comparison grouped by merchant, with that category as a filter.
- [ ] **Explore summary cards** (EXP-10). Show total, average for each month, change, and count above the chart.

## Milestone 5: Trips

- [ ] Add `trips` and `trip_transactions (trip_id, transaction_id, amount NULL = full amount)` (TRIP-01, TRIP-09).
- [ ] Add Trips CRUD API and the Trips list page.
- [ ] Add trip suggestions. Score candidates from the date window, the pre-trip window, travel categories and merchants, the currency, and the Plaid location. Exclude categories with kind `transfer` and recurring charges.
- [ ] Add the review screen with accept or reject, one at a time or in bulk.
- [ ] Add the trip summary page. It uses the existing `AnalyticsQuery` with a trip filter.
- [ ] Add `trip` as a filter and a dimension in Explore (TRIP-12, EXP-05).
- [ ] Make sure that Plaid sync keeps trip links when a transaction changes (TRIP-08). A removed Plaid row deletes its link.

## Milestone 6: Automation and polish

- [ ] **Split API and UI.** Create child rows whose sum equals the parent amount. Validate the sum on the server.
- [ ] **Merchant normalization.** Add `merchants` and `merchant_aliases`. Apply them in import and sync. Add a merge screen in Settings.
- [ ] **Recurring items.** Detect charges with the same merchant and a similar amount at a regular interval. Let the user confirm them. Show price increases.
- [ ] **Change history.** Record each manual and rule change to a transaction.
- [ ] **Transfer matching.** Pair a money-out row and a money-in row with the same amount across two owned accounts within 3 days.
- [ ] **AND/OR rule conditions.**
- [ ] **Multi-currency.** Select an FX rate source. Store the converted amount with the rate date.

## Milestone 7: Developer setup

- [x] **Setup script.** One command installs packages, makes `.env` from `.env.example`, makes the secrets, and seeds the demo data.
- [x] **Fewer environment variables.** Derive `CRON_SECRET` and `APP_SECRET_KEY` from one root secret. Then a deploy needs only `APP_PASSWORD` and that secret. Keep the current `APP_SECRET_KEY` value working, so that stored bank tokens stay readable.
- [x] **Dockerfile and Docker Compose.** Build the Next.js app with `output: "standalone"`. Compose runs the app and a Postgres container.

## Milestone 8: Backend performance and reliability

- [x] **Indexes.** Now only `transactions(date)` and `transactions(parent_id)` exist. Use `EXPLAIN` on the report queries, and then add indexes for the common filters, for example `(account_id, date)` and `(category_id, date)`.
- [x] **Transactions and isolation.** Sync and import already use `BEGIN`. Make sure that Plaid sync cannot run 2 times at once for the same connection. A Postgres advisory lock does this.
- [x] **Idempotency keys.** Add them to CSV import and the bank connect flow, so that a retry does not add rows 2 times.
- [x] **Connection pooling.** The pool has `max: 3`. On Vercel, use the Neon pooled connection URL.
- [ ] **Pagination.** Use cursor pagination on the transaction list.
- [x] **Timeouts and retries.** Set timeouts on Plaid and Anthropic calls. Retry with backoff only on errors that are safe to retry.

## Backlog

Do these items only when there is a need for them.

- [ ] **Caching and TTLs.** Cache report results for a short time. Clear the cache after a sync or an edit. Do this only if reports become slow.
- [ ] **Rate limiting.** Limit failed login attempts and Ask requests (Ask calls a paid API).
- [ ] **Observability.** Vercel logs and analytics are enough for now. If they are not enough, add structured JSON logs with a request ID, metrics (request time, error rate, sync failures, Ask token use), and OpenTelemetry traces through `instrumentation.ts`. Never log tokens, passwords, or bank data.
- [ ] **Helm chart.** Only if the app moves off Vercel to Kubernetes.
