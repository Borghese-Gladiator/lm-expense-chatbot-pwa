# TODO

The work items are in order inside each section. Requirement IDs refer to [PRD.md](archive/PRD.md). Usage PRDs are in [docs/prd](prd/README.md).

Spend Lens tracks expenses. It has no budgets, no goals, no bill payment, no net worth, no recurring items, no transfer matching, and no multi-currency. All amounts are USD.

## Status key

| Icon | Meaning |
|---|---|
| ✅ | Done |
| 🟡 | Partial. Some code exists. |
| 🔍 | Built and unit tested. Not yet checked in the browser or with sandbox keys. |
| ⬜ | Not started. No code exists. |
| 🤔 | A decision is needed first. |

The icons come from a read of the code and the PRDs. No icon is a browser result.

## Main tasks

### 1. PRDs on usage

- ✅ [x] Write the ten usage PRDs in `docs/prd/`.
- ⬜ [ ] Review each PRD. Change the user steps that do not match the intended use.
- ⬜ [ ] Check each **Verify** step in the browser. Change its status to Works, Partial, or Missing.
- 🤔 [ ] Decide the rule order. The code makes the last matching rule win. The old PRD says the first rule wins (PRD 05).
- 🤔 [ ] Decide how long to keep change history (PRD 08).

### 2. Plaid integration (PRD 07)

- 🔍 [ ] Test Plaid with sandbox keys. Connect a sandbox bank, sync, and check that pending, posted, and removed rows are correct (BANK-01).
- 🔍 [ ] Test Reconnect (update mode) in the sandbox with a forced `ITEM_LOGIN_REQUIRED`.
- 🔍 [x] **Rename a connection.** Done. The name stays after a sync and after Reconnect.
- 🔍 [x] **Accounts page.** Grouped by bank, with Sync all, Disconnect (keep or delete rows), account links to Transactions, type labels, and times in plain words.
- 🔍 [x] Add a banner on every page when a connection needs sign-in.
- 🟡 [ ] Show a plain reason and a plain next step for each Plaid error. The page shows the last error text now.
- ⬜ [ ] Mark a connection as broken after three failed syncs in a row.
- ⬜ [ ] Add Plaid webhooks for `ITEM_LOGIN_REQUIRED` and `PENDING_EXPIRATION`. Verify the signature.
- ✅ [x] Plaid sync keeps trip links when a pending row posts or changes (TRIP-08). A removed Plaid row deletes its link. Covered by unit tests with the fake bank.
- 🔍 [ ] Test duplicate resolution with real Plaid history and migrated CSV rows.

### 3. UI revamp (PRD 10)

- ⬜ [ ] **UI/UX design pass.** Review each page for layout, spacing, empty states, and loading states. Make one list of fixes, and then do them.
- ⬜ [ ] **Mobile support.** Make each page responsive! Make tables scroll or stack on small screens. Make drawers full screen on phones. Test on iOS Safari and Android Chrome.
- 🟡 [ ] **PWA.** The manifest and icons exist. Check install and the login cookie in the installed app. Show an offline message with no cached data. Do not cache `/api/` responses, because they contain bank data.

### 4. Bug bash

- 🔍 [ ] Test Ask with a real API key. Run the 10 questions in PRD 09.
- ⬜ [ ] Measure report time on 50,000 transactions. The target is less than two seconds.
- ⬜ [ ] Use the app for one week with real data. Write each fault in one list, and fix the list.

### 5. Security audits

Write each fault in the bug bash list with a severity. Final bug bash section F has the browser checks.

- ⬜ [ ] **Dependencies.** Run `npm audit`. Fix each high and critical fault. Add the check to CI.
- ⬜ [ ] **Secrets.** Scan the source and the git history for keys, tokens, and passwords. Rotate each secret that appears.
- ⬜ [ ] **Auth.** Read the login code and the cookie code. Check the password compare, the cookie signing, the cookie expiry, and the sign-out.
- ⬜ [ ] **Route access.** List each `/api/` route. Check that each route checks the login, except the login route and the webhook routes.
- ⬜ [ ] **Plaid tokens.** Check where the access tokens are stored. Check that no token goes to the browser, to a log, or to an error message.
- ⬜ [ ] **SQL.** Read each query. Check that each value uses a parameter and that no query joins user text into the SQL.
- ⬜ [ ] **Input checks.** Check that each route validates the body, the query, and the file size. Include the CSV import.
- ⬜ [ ] **Ask.** Check that the model has read access only and that the SQL tool cannot write. Test prompt injection through a merchant name.
- ⬜ [ ] **Headers.** Check `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, and `Strict-Transport-Security` on each page.
- ⬜ [ ] **Webhooks.** Check that the signature check runs before any other work. Check the replay window.
- ⬜ [ ] **Rate limits.** Check the login limit and the Ask limit. Check that the limit holds across more than one server instance.
- ⬜ [ ] **Data at rest.** Check the Neon access rules, the backup access, and the PGlite file permissions.
- ⬜ [ ] **Repeat.** Do these audits again before each release and after each change to auth, Plaid, or Ask.

## Features

Do these in order. Each item names its PRD.

- 🔍 [x] **Split transactions** (PRD 06). API, server check of the sum, editor in the row detail, and the sync edge cases.
- 🟡 [ ] **Change history** (PRD 08). The table, the History list in the row detail, and entries for manual edits, bulk edits, and rule runs exist. Open: undo one change, undo a bulk edit, undo a rule run on a sync.
- 🟡 [ ] **Rules and merchants** (PRD 05):
  - 🔍 [x] Edit a rule.
  - 🔍 [x] Add a "set type" action, to mark transfers.
  - ⬜ [ ] Make a rule from a transaction.
  - ⬜ [ ] Add a merchant list with rename and merge.
  - ⬜ [ ] Add rule order controls.
  - ⬜ [ ] Record and undo the rule run on a sync.
  - ⬜ [ ] Add more text conditions (starts with, equals, regex), and category, date, and type conditions.
  - ⬜ [ ] Add AND/OR groups.
  - 🔍 [x] Show the matching rows in the rule preview.
- 🔍 [x] **Explore** (PRD 01, PRD 02). Check each item in the browser:
  - 🔍 [x] `trip` as a filter and a dimension (TRIP-12, EXP-05).
  - 🔍 [x] Complete-month and rolling presets, with a label (EXP-01, EXP-02).
  - 🔍 [x] Category exclusion (EXP-09).
  - 🔍 [x] Year-over-year overlay chart (YOY-04).
  - 🔍 [x] "Same period last year" is the default for year to date (YOY-03).

## Backlog

Do these items only when there is a need for them.

- ⬜ [ ] **Caching and TTLs.** Cache report results for a short time. Clear the cache after a sync or an edit. Do this only if reports become slow.
- ⬜ [ ] **Push notices.** Send a PWA notice for a broken connection. Do this after the banner.
- ⬜ [ ] **Observability.** Vercel logs and analytics are enough for now. If they are not enough, add structured JSON logs with a request ID, metrics (request time, error rate, sync failures, Ask token use), and OpenTelemetry traces through `instrumentation.ts`. Never log tokens, passwords, or bank data.
- ⬜ [ ] **Helm chart.** Only if the app moves off Vercel to Kubernetes.

## Final bug bash

Do this after all other work. Do each step in order. Write each fault in one list with a severity (P0 data loss or leak, P1 wrong number, P2 broken flow, P3 cosmetic). Fix each P0, P1, and P2 fault. Then do the whole bash again.

### A. Prepare

- ⬜ [ ] Make a copy of the database with real data. Keep the original safe.
- ⬜ [ ] Connect a Plaid sandbox bank. Keep the real connections in a different copy.
- ⬜ [ ] Run the unit tests, lint, typecheck, and a production build. All must pass before the bash starts.

### B. Every PRD step

- ⬜ [ ] Do each step in the ten PRDs in the browser. Set the status to Works, Partial, or Missing.
- ⬜ [ ] Do each **Verify** step first.
- ⬜ [ ] Do each step again after an undo, a reload, and a sign-out and sign-in.

### C. Numbers are correct

- ⬜ [ ] Compare the monthly totals of three months with the bank statements. The difference must be zero.
- ⬜ [ ] Check that transfers leave the spending totals.
- ⬜ [ ] Check that a split row counts once, and that the parts sum to the parent.
- ⬜ [ ] Check that pending to posted keeps one row and keeps the edits.
- ⬜ [ ] Check that a total on Explore, on the trip report, and in Ask match for the same filter.
- ⬜ [ ] Check that an undo returns the exact old values, for one edit, a batch, a bulk edit, and a sync-time rule run.
- ⬜ [ ] Check that the year-over-year and previous-period labels name the real date ranges.

### D. Edge data

- ⬜ [ ] Test an empty database, one row, and 50,000 rows. Report time must be less than two seconds.
- ⬜ [ ] Test a refund, a zero amount, a negative amount, and a very large amount.
- ⬜ [ ] Test a merchant name with emoji, accents, quotes, and 300 characters.
- ⬜ [ ] Test a row at 23:59 on the last day of a month, a leap day, and a year boundary. Test with the browser in two time zones.
- ⬜ [ ] Import the same CSV twice. No duplicate must remain.
- ⬜ [ ] Import a CSV with a bad header, a bad date, a bad amount, and a blank line.

### E. Failure injection

- ⬜ [ ] Force each Plaid error (`ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION`, rate limit, server error). Check the banner, the reason, and the next step.
- ⬜ [ ] Force three failed syncs in a row. Check that the connection shows as broken.
- ⬜ [ ] Press Sync now twice at once. Check that no duplicate rows appear.
- ⬜ [ ] Edit a row while a sync runs. Check that the edit stays.
- ⬜ [ ] Make the Ask API fail, time out, and return invalid JSON. Check that the page shows a clear message.
- ⬜ [ ] Stop the database during a request. Check that the page shows an error and does not show partial data.
- ⬜ [ ] Rename a connection, then sync and reconnect. Check that the name stays.

### F. Security

- ⬜ [ ] Call each `/api/` route with no login cookie. Each route must return 401, except the login route and the webhook routes.
- ⬜ [ ] Check the cookie flags: `HttpOnly`, `Secure`, `SameSite`.
- ⬜ [ ] Send a webhook with a bad signature. The app must refuse it.
- ⬜ [ ] Try 20 wrong passwords. The app must slow or block the attempts.
- ⬜ [ ] Ask a question that tries to change the instructions or to write data. Check that Ask only reads.
- ⬜ [ ] Search the logs, the browser bundle, and the network responses for tokens, passwords, and bank data. None must appear.
- ⬜ [ ] Check that no secret is in the source and that each secret is in the Vercel environment.

### G. Devices and PWA

- ⬜ [ ] Test each page at 375 px, on a tablet width, and on a wide screen.
- ⬜ [ ] Test on iOS Safari and Android Chrome.
- ⬜ [ ] Install the app. Check the login cookie, the icon, and the start page.
- ⬜ [ ] Turn off the network. Check that the offline message shows and that no bank data shows.
- ⬜ [ ] Check that the service worker, if one exists, does not cache `/api/` responses.
- ⬜ [ ] Test with the keyboard only, and with a screen reader on the main pages.

### H. Ask

- ⬜ [ ] Run the 10 questions in PRD 09 with a real API key. Check each answer against Explore.
- ⬜ [ ] Ask about a trip, a split row, and a category that does not exist.
- ⬜ [ ] Ask 30 questions fast. Check that the rate limit works.

### I. Use for one week

- ⬜ [ ] Use the app each day for one week with real data. Add each fault to the list on the day that it occurs.
- ⬜ [ ] At the end, fix the list. Then do sections B to H again for each fixed area.
