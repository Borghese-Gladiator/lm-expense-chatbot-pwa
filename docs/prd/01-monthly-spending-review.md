# PRD 01: Monthly spending review

## User and goal

The user is the account owner. Once a month, the user wants to know where the money went in the last month and the last three months.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Sign in | The Overview page opens | Works | One shared password |
| 2 | Read the Overview cards | Total spending, income, and count for the period | Works | |
| 3 | Pick a period | Last complete month, last three complete months, year to date, custom | Partial | Presets include the current partial month. No rolling 30 or 90 day preset (EXP-01). |
| 4 | See if the period is rolling or calendar | A label next to the period | Missing | EXP-02 |
| 5 | Read the monthly chart | One bar for each month | Works | |
| 6 | Open Explore from a card | Explore opens with the same filters | Verify | |
| 7 | Group by category | Table with value, previous value, change, share | Works | |
| 8 | Click a category | The same table grouped by merchant, with the category as a filter | Works | EXP-07 |
| 9 | Click a merchant or a number | The transactions behind it | Works | |
| 10 | Exclude one transaction from this view | Totals update. The ledger does not change. | Works | |
| 11 | Exclude one category from this view | Totals update. The ledger does not change. | Missing | EXP-09 |
| 12 | Save the report | The report shows in the saved list | Works | |
| 13 | Reopen the saved report | Same filters and period | Works | |

## Result

The user answers "How much did I spend in the last three complete months, and in which categories?" in two clicks from Explore.

## Acceptance criteria

- A transfer does not count as spending.
- A refund reduces its category total.
- A split parent does not count with its parts.
- Cards, charts, and tables apply the same filters.
- Each reported number opens its transactions.

## Gaps to build

- Rolling and complete-month presets, with a label (EXP-01, EXP-02).
- Category exclusion in Explore (EXP-09).
