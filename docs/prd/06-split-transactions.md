# PRD 06: Split transactions

## User and goal

The user is the account owner. One charge can cover many categories. For example, a $120 store charge is $80 groceries and $40 household. The user wants to divide the charge. Reports must count the parts and not the whole charge.

## Current state

The `transactions` table has a `parent_id` column. The `reportable` view removes a parent that has children. There is no API route and no screen to make a split.

## Rules

- A child has the same account and date as its parent.
- The sum of the children equals the parent amount. The server checks this and rejects any other sum.
- A child has its own category, merchant, tags, and notes.
- A parent that has children never counts in a report. Its children count.
- A child cannot have children.
- A split row cannot be a row that is already a child.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open a row and choose Split | A split editor with two parts | Missing | |
| 2 | Enter an amount and a category for each part | The editor shows the remainder | Missing | |
| 3 | Add or remove a part | The remainder updates | Missing | |
| 4 | Save when the sum does not equal the parent | An error that shows the difference | Missing | The server validates |
| 5 | Save when the sum is correct | The parent shows as split. The parts show under it. | Missing | |
| 6 | See reports use the parts | Category totals use the parts. The total does not change. | Works | The view already does this |
| 7 | Edit one part | The part saves | Missing | |
| 8 | Remove the split | The parts go. The parent counts again. | Missing | |
| 9 | Search and filter | A part shows once. A split parent shows with a mark. | Missing | |
| 10 | Export to CSV | Parts export with their parent id | Verify | |
| 11 | Link a part to a trip | The part counts in the trip with its own amount | Verify | |

## Edge cases to decide

| Case | Proposed rule |
|---|---|
| A bank sync changes the amount of a split parent | Remove the split, mark the parent unreviewed, and show a notice. The parent counts again. |
| A pending row becomes posted | Move the children to the posted row. |
| A bank sync removes the parent | Delete the children with the parent. |
| A rule matches a split parent | The rule skips the parent. A rule can still match a child. |
| A refund for a split charge | Treat it as a new row. The user can split it by hand. |

## Result

The user divides one charge in less than 30 seconds. Category totals are correct. The overall total does not change.

## Acceptance criteria

- The sum of the parts always equals the parent amount.
- Reports never count a parent and its parts together.
- A split is undoable (PRD 08).
- A bank sync never leaves a split in a state that gives a wrong total.

## Gaps to build

- API: create a split, replace a split, remove a split.
- Server validation of the sum.
- The split editor in the row detail.
- Rules for the sync edge cases.
