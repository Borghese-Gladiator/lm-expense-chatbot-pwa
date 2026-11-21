# PRD 04: New transaction triage

## User and goal

The user is the account owner. After a sync, the user wants to check each new row, fix it, and mark it reviewed. The user wants most rows to need no work, because rules already classified them.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open Transactions | Pages of 100 rows, newest first | Works | |
| 2 | Filter to unreviewed rows | Only unreviewed rows | Works | |
| 3 | Filter to uncategorized rows | Only rows with no category | Works | |
| 4 | Search by text, account, amount, date, tag, or category | Matching rows | Works | |
| 5 | Open a row | Source record, merchant, category, type, tags, notes | Works | |
| 6 | See which rule changed the row | The rule name and the old values | Missing | See PRD 05 and PRD 08 |
| 7 | Edit merchant, category, type, tags, notes | The row saves and shows as edited | Works | |
| 8 | Mark the row reviewed | The row leaves the unreviewed filter | Works | |
| 9 | Select many rows and set category, reviewed, or transfer | All selected rows update | Works | |
| 10 | Make a rule from a row | The rule form opens with the merchant text filled in | Missing | The fastest way to remove future work |
| 11 | Resolve a possible duplicate between a Plaid row and a CSV row | Keep one, or mark "not a duplicate" | Works | Shows in Accounts |
| 12 | Add a manual transaction | The row shows in the list | Works | |
| 13 | Delete a manual transaction | The row goes | Works | |
| 14 | Split the row | See PRD 06 | Missing | |
| 15 | Undo the last edit | The row returns to its old values | Missing | See PRD 08 |

## Result

After a sync, the user clears the unreviewed list in a few minutes. Each month, fewer rows need work, because the user makes a rule from each repeated fix.

## Acceptance criteria

- A rule never changes a field that the user edited by hand.
- A bulk edit shows the count before it saves.
- A reviewed row stays reviewed after a sync.
- A pending row that becomes posted keeps the user edits.

## Gaps to build

- Make a rule from a row.
- Show the rule that changed a row.
- Undo an edit (PRD 08).
