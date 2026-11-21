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

# Plan 3: Merchants and rules from a row

## Changes

1. `GET /api/merchants`: each merchant with its row count, from `reportable`, most rows first.
2. `POST /api/merchants/rename`: body `{ from: [names], to: name }`. It writes one rule for each name in `from` (text equals the name), sets the merchant to `to`, and applies it to past rows. It returns the execution ids, so the page can undo.
3. A rule matches on the text of the payee and the merchant. A rule for "Amazon" would also match "Amazon Prime". A new match mode `equals` makes a merchant rule exact. Add the column `text_match` ('contains' or 'equals') to `rules`.
4. Settings: a Merchants section with a search box, row counts, a Rename button, and a Merge action for selected names.
5. Row detail: a "Make a rule from this row" button. It opens the Rules form with the text set to the merchant, the category set to the row category, and the type set to the row type.

## Tests

### Unit

- Merchant list counts rows and leaves out the parts of a split parent.
- Rename writes a rule, changes past rows, skips edited rows, and can be undone.
- Merge maps three names to one name.
- An `equals` rule does not match a longer name.
- Renaming to an existing name merges the rows.

### Manual (browser)

1. Open Settings. Merchants lists names with counts.
2. Select two names, and merge them. Both show as one name.
3. Open a row. Press "Make a rule from this row". The rule form shows the row values.
