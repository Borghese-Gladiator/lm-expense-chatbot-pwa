# PRD 07: Bank connection and sync

## User and goal

The user is the account owner. The user wants the app to hold current data from each bank without daily work. When a connection breaks, the user wants to know at once and fix it in one click.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Connect a bank with Plaid Link | The bank and its accounts show | Verify | Not tested with sandbox keys (BANK-01) |
| 2 | Wait for the first history sync | Up to 730 days of rows | Verify | |
| 3 | See pending rows | Pending rows show with a mark | Works | |
| 4 | See a pending row become posted | One row remains. Edits stay. | Works | BANK-05 |
| 5 | See a removed row go | The row goes. A trip link goes with it. | Verify | |
| 6 | Wait for the daily sync | New rows show with no action | Works | Vercel Cron, one time each day |
| 7 | Press Sync now on one connection | The connection syncs | Verify | The route exists. Check the button. |
| 8 | Read the last good sync time on each connection | A date and time | Works | |
| 9 | Read the last error on each connection | The error text | Works | |
| 10 | See a broken connection on any page | A banner on every page with a link to Accounts | Missing | Today the user must open Accounts |
| 11 | Press Reconnect on a broken connection | Plaid Link opens in update mode | Works | Built, not tested with a real bank |
| 12 | Finish Reconnect | The status returns to Connected. Sync runs. | Works | |
| 13 | Get a warning before the link expires | A notice with the expiry date | Missing | Plaid `PENDING_EXPIRATION` webhook |
| 14 | Get new rows at once after a bank posts them | Rows show in minutes | Missing | Plaid webhook. Optional. |
| 15 | Read the sync history | A list of runs with status and counts | Works | |
| 16 | Disconnect a bank | Connection goes. The rows stay. | Verify | |
| 17 | Add a bank that Plaid does not cover through CSV import | Rows import. Duplicates skip. | Works | |
| 18 | Add a manual account | The account shows | Works | |
| 19 | See a Plaid row that matches a CSV row | A pair in the duplicates list. The user keeps one. | Works | |
| 20 | Merge a Plaid account into a migrated account | One account remains | Works | `accounts/:id/merge` |

## Improvements to connection repair

1. **Banner.** Show a banner on every page when any connection needs sign-in. The banner has a Reconnect link.
2. **Webhook.** Receive `ITEM_LOGIN_REQUIRED` and `PENDING_EXPIRATION` from Plaid. The app verifies the signature of each webhook. The app marks the connection at once and does not wait for the next sync.
3. **Clear text.** Show a plain reason and a plain next step for each error code. Do not show the raw code alone.
4. **Failure count.** After three failed syncs in a row, mark the connection as broken and show the banner.
5. **Push notice.** The PWA can send a notice for a broken connection. This is optional. Do it after the banner.

## Result

The user does not check the sync. A broken link shows in a banner the next time the user opens the app. One click fixes it.

## Acceptance criteria

- A sync that stops in the middle leaves no half-written data. The cursor saves only after all writes commit.
- A second sync with no new data changes nothing.
- A user edit survives each sync.
- The app never stores a bank password.
- Plaid tokens stay on the server, encrypted.

## Gaps to build

- Test with sandbox keys. This is the first step.
- The broken-connection banner.
- Plaid webhooks with signature check.
- Plain error text.
- A browser check of Sync now and Disconnect.
