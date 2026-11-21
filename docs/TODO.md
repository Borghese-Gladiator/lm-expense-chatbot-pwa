# TODO

The work items are in order inside each section. Requirement IDs refer to [PRD.md](archive/PRD.md). Usage PRDs are in [docs/prd](prd/README.md).

Spend Lens tracks expenses. It has no budgets, no goals, no bill payment, no net worth, no recurring items, no transfer matching, and no multi-currency. All amounts are USD.

## Main tasks

### 1. PRDs on usage

- [x] Write the ten usage PRDs in `docs/prd/`.
- [ ] Review each PRD. Change the user steps that do not match the intended use.
- [ ] Check each **Verify** step in the browser. Change its status to Works, Partial, or Missing.
- [ ] Decide the rule order. The code makes the last matching rule win. The old PRD says the first rule wins (PRD 05).
- [ ] Decide how long to keep change history (PRD 08).

### 2. Plaid integration (PRD 07)

- [ ] Test Plaid with sandbox keys. Connect a sandbox bank, sync, and check that pending, posted, and removed rows are correct (BANK-01).
- [ ] Test Reconnect (update mode) in the sandbox with a forced `ITEM_LOGIN_REQUIRED`.
- [ ] Add a banner on every page when a connection needs sign-in.
- [ ] Show a plain reason and a plain next step for each Plaid error.
- [ ] Mark a connection as broken after three failed syncs in a row.
- [ ] Add Plaid webhooks for `ITEM_LOGIN_REQUIRED` and `PENDING_EXPIRATION`. Verify the signature.
- [ ] Test that Plaid sync keeps trip links when a transaction changes (TRIP-08). A removed Plaid row deletes its link.
- [ ] Test duplicate resolution with real Plaid history and migrated CSV rows.

### 3. UI revamp (PRD 10)

- [ ] **UI/UX design pass.** Review each page for layout, spacing, empty states, and loading states. Make one list of fixes, and then do them.
- [ ] **Mobile support.** Make each page work at 375 px width. Make tables scroll or stack on small screens. Make drawers full screen on phones. Test on iOS Safari and Android Chrome.
- [ ] **PWA.** Check install and the login cookie in the installed app. Show an offline message with no cached data. Do not cache `/api/` responses, because they contain bank data.

### 4. Bug bash

- [ ] Test Ask with a real API key. Run the 10 questions in PRD 09.
- [ ] Measure report time on 50,000 transactions. The target is less than two seconds.
- [ ] Use the app for one week with real data. Write each fault in one list, and fix the list.

## Features

Do these in order. Each item names its PRD.

- [ ] **Split transactions** (PRD 06). Add the API and the editor. Validate on the server that the parts sum to the parent. Decide the sync edge cases.
- [ ] **Change history** (PRD 08). Add `transaction_changes`. Write an entry from every update path. Add History and undo to the row detail. Move rule undo onto it.
- [ ] **Rules and merchants** (PRD 05):
  - [ ] Edit a rule.
  - [ ] Add a "set type" action, to mark transfers.
  - [ ] Make a rule from a transaction.
  - [ ] Add a merchant list with rename and merge.
  - [ ] Add rule order controls.
  - [ ] Record and undo the rule run on a sync.
  - [ ] Add more text conditions (starts with, equals, regex), and category, date, and type conditions.
  - [ ] Add AND/OR groups.
- [ ] **Explore** (PRD 01, PRD 02):
  - [ ] Add `trip` as a filter and a dimension (TRIP-12, EXP-05).
  - [ ] Add complete-month and rolling presets, with a label (EXP-01, EXP-02).
  - [ ] Add category exclusion (EXP-09).
  - [ ] Add the year-over-year overlay chart (YOY-04).
  - [ ] Make "Same period last year" the default for year to date (YOY-03).

## Backlog

Do these items only when there is a need for them.

- [ ] **Caching and TTLs.** Cache report results for a short time. Clear the cache after a sync or an edit. Do this only if reports become slow.
- [ ] **Rate limiting.** Limit failed login attempts and Ask requests (Ask calls a paid API).
- [ ] **Push notices.** Send a PWA notice for a broken connection. Do this after the banner.
- [ ] **Observability.** Vercel logs and analytics are enough for now. If they are not enough, add structured JSON logs with a request ID, metrics (request time, error rate, sync failures, Ask token use), and OpenTelemetry traces through `instrumentation.ts`. Never log tokens, passwords, or bank data.
- [ ] **Helm chart.** Only if the app moves off Vercel to Kubernetes.
