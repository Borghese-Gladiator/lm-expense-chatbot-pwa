# PRD 02: Spending change analysis

## User and goal

The user is the account owner. The user wants to know why spending changed against an earlier period or an earlier year. The user also wants to separate real change from one-time expenses.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open Explore and pick a period | Totals for the period | Works | |
| 2 | Pick a comparison: previous period, same period last year, custom, none | Change and percent change for each row | Works | EXP-04 |
| 3 | Pick year to date with "Same period last year" | Equal elapsed periods | Works | |
| 4 | Pick year to date with "Previous period" | A clear result or a block | Partial | The range is not useful (YOY-02) |
| 5 | Open year to date for the first time | "Same period last year" is the default | Missing | YOY-03 |
| 6 | See both years on one chart | Two lines aligned by calendar month | Missing | YOY-04 |
| 7 | Rank categories by share of the change | The largest cause is at the top | Works | |
| 8 | Click the top category | Merchants in that category, with the change | Works | |
| 9 | Click a merchant | The transactions behind the change | Works | |
| 10 | Exclude an unusual purchase | Totals and change update for this view only | Works | YOY-06 |
| 11 | Show a trip as a dimension | Trip spending against other spending | Missing | Needs the trip dimension (TRIP-12) |
| 12 | Save the analysis | The report shows in the saved list | Works | |

## Result

The user finds the category and merchant that caused most of a change in three clicks or fewer.

## Acceptance criteria

- The app never compares a partial period with a full period without a label.
- A report for a past period uses the current categories.
- Each total traces to its transactions.
- A saved report reopens with the same result for the same data.

## Gaps to build

- Year-over-year overlay chart (YOY-04).
- Year to date comparison default (YOY-03).
- Trip as a filter and a dimension (TRIP-12).
