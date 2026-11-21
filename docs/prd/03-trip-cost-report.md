# PRD 03: Trip cost report

## User and goal

The user is the account owner. The user took a trip. The user wants to know what the trip cost, without a change to any category.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Create a trip with a name, start date, and end date | The trip shows in the list | Works | Target: less than one minute |
| 2 | Add optional destination, description, and pre-trip window | Fields save | Works | |
| 3 | Open the review screen | Suggestions in high, medium, and low groups, each with a reason | Works | |
| 4 | Accept or reject one suggestion | The link saves or the row hides | Works | |
| 5 | Accept or reject suggestions in bulk | All selected rows update | Works | |
| 6 | See that transfers and recurring charges are not suggested | Not in the list | Works | |
| 7 | Add a transaction by hand, outside the trip dates | The row links to the trip | Verify | TRIP-02 |
| 8 | Remove a row from the trip | The link goes. The row and its category stay. | Works | TRIP-03 |
| 9 | Read the trip summary | Total, daily average, count | Works | |
| 10 | Read the trip cost by category | Dining stays Dining, hotels stay Lodging | Works | TRIP-04 |
| 11 | Read gross cost, refunds, reimbursements, and net cost | Four separate numbers | Verify | TRIP-10 |
| 12 | See a refund reduce the trip cost | Net cost drops | Verify | TRIP-06 |
| 13 | Link part of a charge to the trip | Only that amount counts | Verify | The table has an `amount` column. TRIP-09 |
| 14 | Open Explore with a trip filter | Only trip rows | Missing | TRIP-12 |
| 15 | Run a bank sync | Trip links stay. A removed Plaid row loses its link. | Verify | TRIP-08 |
| 16 | Change the category of a trip row | The trip link stays | Verify | |

## Result

The user opens one page and reads the net cost of the trip. The category reports do not change.

## Acceptance criteria

- A flight booked before the trip counts in the trip total.
- No row counts twice in the overall totals.
- Trip links stay after a category change and after a sync.
- A transfer never counts in a trip total.

## Gaps to build

- Trip filter and dimension in Explore (TRIP-12).
- A test for trip links after a sync (TRIP-08).
- A check of net cost, refunds, and reimbursements (TRIP-10).
