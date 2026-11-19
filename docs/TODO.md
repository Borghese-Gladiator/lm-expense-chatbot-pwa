# TODO

The work items are in order inside each section. Requirement IDs refer to [PRD.md](archive/PRD.md).

## Fixes from the first build

- [ ] Test Plaid with sandbox keys. Connect a sandbox bank, sync, and check that pending, posted, and removed rows are correct (BANK-01).
- [ ] Test Ask with a real API key. Check that the model returns a valid `AnalyticsQuery` for 10 typical questions.
- [x] Delete `app/public/sw.js`. The file is gone, and `GET /sw.js` returns 404.

## Usability

- [ ] **UI/UX design pass.** Review each page for layout, spacing, empty states, and loading states. Make one list of fixes, and then do them.
- [ ] **Mobile support.** Make each page work at 375 px width. Make tables scroll or stack on small screens. Make drawers full screen on phones. Test on iOS Safari and Android Chrome.
- [ ] **PWA.** Make the app installable to the home screen. The manifest exists. Check that the login cookie works in the installed app. Add a service worker only if offline use is needed. Do not cache `/api/` responses, because they contain bank data.

## Spending analytics

- [x] **Category to merchant drill-down** (EXP-07). In the comparison table, a click on a category opens the same comparison grouped by merchant, with that category as a filter. Today a click opens the transaction drawer.
- [x] **Explore summary cards** (EXP-10). Show total, average for each month, change, and count above the chart.

## Trips

- [x] Add `trips` and `trip_transactions (trip_id, transaction_id, amount NULL = full amount)` (TRIP-01, TRIP-09).
- [x] Add Trips CRUD API and the Trips list page.
- [x] Add trip suggestions. Score candidates from the date window, the pre-trip window, travel categories and merchants, the currency, and the Plaid location. Exclude categories with kind `transfer` and recurring charges.
- [x] Add the review screen with accept or reject, one at a time or in bulk.
- [x] Add the trip summary page. It uses the existing `AnalyticsQuery` with a trip filter.
- [ ] Add `trip` as a filter and a dimension in Explore (TRIP-12, EXP-05).
- [ ] Make sure that Plaid sync keeps trip links when a transaction changes (TRIP-08). A removed Plaid row deletes its link.

## Automation and polish

- [ ] **Split API and UI.** Create child rows whose sum equals the parent amount. Validate the sum on the server.
- [ ] **Merchant normalization.** Add `merchants` and `merchant_aliases`. Apply them in import and sync. Add a merge screen in Settings.
- [ ] **Recurring items.** Detect charges with the same merchant and a similar amount at a regular interval. Let the user confirm them. Show price increases.
- [ ] **Change history.** Record each manual and rule change to a transaction.
- [ ] **Transfer matching.** Pair a money-out row and a money-in row with the same amount across two owned accounts within 3 days.
- [ ] **AND/OR rule conditions.**
- [ ] **Multi-currency.** Select an FX rate source. Store the converted amount with the rate date.

## Backlog

Do these items only when there is a need for them.

- [ ] **Caching and TTLs.** Cache report results for a short time. Clear the cache after a sync or an edit. Do this only if reports become slow.
- [ ] **Rate limiting.** Limit failed login attempts and Ask requests (Ask calls a paid API).
- [ ] **Observability.** Vercel logs and analytics are enough for now. If they are not enough, add structured JSON logs with a request ID, metrics (request time, error rate, sync failures, Ask token use), and OpenTelemetry traces through `instrumentation.ts`. Never log tokens, passwords, or bank data.
- [ ] **Helm chart.** Only if the app moves off Vercel to Kubernetes.
