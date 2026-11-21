# Plan: Accounts polish

## Brief

Make the Accounts page easier to use. Warn about a broken bank on every page. Let the user disconnect a bank and keep its rows.

## Changes

1. An account name links to Transactions, filtered to that account (`#transactions?account=ID`).
2. A **Sync all** button on Accounts. New route `POST /api/plaid/sync-all`.
3. A banner on every page except Accounts when a connection needs attention.
4. A colored type label on each account.
5. Last sync in plain words, for example "2 hours ago".
6. **Disconnect** replaces **Remove**. It keeps accounts and rows. A second menu item deletes them. Route: `DELETE /api/plaid/items/:id?data=delete`.

## Tests

### Unit

- `ago()` for never, seconds, hours, days, and months.
- Disconnect keeps accounts and rows, and unlinks the accounts.
- Disconnect with `data=delete` removes accounts and rows.
- Sync all syncs each connection that is not broken.

### Manual (browser)

1. Open Accounts. Each account name is a link.
2. Click an account name. Transactions opens with that account in the Account filter.
3. Click **Sync all**. A message shows the result.
4. Open Overview with a broken connection. A red banner names the bank.
5. Click **Open Accounts** in the banner. Accounts opens.
6. Open the **Disconnect** menu on a connection. Choose "keep transactions". The bank leaves the list. Its accounts stay under "Accounts with no bank link".
7. Disconnect another bank with "delete transactions". Its accounts leave the list.

# Plan 2: Next features

## Order

1. Keep trip links when a pending row posts (TRIP-08). Test modified and removed rows too.
2. Rename a bank connection. A new column `display_name` keeps the name through sync and Reconnect.
3. Rules: edit a rule, a "set type" action, a "set notes" action, matching rows in the preview, and a record of rule runs on sync.
4. Split transactions: API with a server check of the sum, and an editor in the row detail.
5. Explore: a trip filter and a trip dimension.

## Tests

- Unit test for each step, in the existing test style.
- Manual: open each page in the browser after step 5.
