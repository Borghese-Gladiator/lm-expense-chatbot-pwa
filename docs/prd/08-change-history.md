# PRD 08: Change history

## User and goal

The user is the account owner. Many things change a transaction: the user, a rule, a bank sync, and a split. The user wants to see each change, know who made it, and undo it.

## Current state

- A `user_edited` flag and `updated_at` exist on each row.
- A `rule_executions` table keeps old values for a manual rule apply, and the user can undo it.
- No record exists for a manual edit, a bulk edit, a sync change, or a rule that ran on new rows.

## Scope

The history covers every change to these fields: merchant, category, type, tags, notes, reviewed, amount, date, and split state. A change can come from these sources:

| Source | Example |
|---|---|
| user | Edit in the row detail |
| bulk | Bulk edit of 40 rows |
| rule | Rule 12 on a manual apply |
| rule-sync | Rule 12 on new rows from a sync |
| sync | The bank changed the amount |
| split | The user split the row |
| import | CSV import |

## Data

One table, `transaction_changes`. Each row holds: transaction id, time, source, an optional rule id, an optional batch id, the field, the old value, and the new value. A bulk edit, a rule apply, and a sync run each get one batch id.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open a row | A History section with the latest changes | Missing | |
| 2 | Read an entry | Time, source, field, old value, new value, rule name | Missing | |
| 3 | Undo one change | The field returns to its old value | Missing | |
| 4 | Undo a user edit that a later rule or sync changed | A warning that later changes exist, and a choice | Missing | |
| 5 | Open a batch | The list of rows in the batch | Missing | |
| 6 | Undo a batch | All rows in the batch return | Partial | Works for a manual rule apply only |
| 7 | Undo a bulk edit | All rows return | Missing | |
| 8 | Undo a sync-time rule run | All rows return | Missing | |
| 9 | Filter the Transactions list to rows that a rule changed | Matching rows | Missing | |
| 10 | See the history after an undo | The undo shows as a new entry | Missing | History is append-only |

## Rules

- History is append-only. An undo adds an entry. It does not delete one.
- An undo of a field that a later change moved asks the user first.
- A field that the user undoes to its old value keeps `user_edited` on.
- The history stores no bank tokens and no raw bank records.
- The history does not grow without limit. Keep 12 months. This is an open decision.

## Result

The user opens any row and sees why it looks the way it does. The user undoes a wrong rule or a wrong bulk edit in one click.

## Acceptance criteria

- Every write path to the fields in scope writes a history entry. A test covers each path.
- An undo restores the exact old value.
- A batch undo is one database transaction. It fully applies or does not apply.
- The history entry for a bulk edit of 1,000 rows writes in less than two seconds.

## Gaps to build

- The `transaction_changes` table and a write helper that every update path uses.
- Move the `rule_executions` undo onto the new table.
- The History section and the undo buttons in the row detail.
- A batch view.
