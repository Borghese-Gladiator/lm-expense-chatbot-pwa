# PRD 05: Rules and merchant normalization

## User and goal

The user is the account owner. Bank descriptions are messy. For example, `AMZN MKTP US*2K4`, `AMAZON.COM`, and `Amazon Marketplace` are one merchant. The user wants rules that set a clean merchant name, a category, and a type. The user wants each rule to apply to new rows and to past rows.

## Decision

Merchant normalization is a rule action. There is no separate alias table. A rule with the action "set merchant" is a merchant mapping. The original bank description stays in `payee_raw`.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open the rules list in Settings | All rules in their order | Works | |
| 2 | Create a rule | The rule saves | Works | |
| 3 | Edit a rule | The rule updates | Missing | The API has create and delete only |
| 4 | Delete a rule | The rule goes. Past changes stay. | Works | |
| 5 | Match on text in the description or merchant | Rows with the text | Works | Case-insensitive contains |
| 6 | Match on account | Rows in that account | Works | |
| 7 | Match on amount range | Rows in the range | Works | |
| 8 | Match on text with "starts with", "equals", or "regex" | Rows that match | Missing | P1 |
| 9 | Match on category, date, or type | Rows that match | Missing | P1 |
| 10 | Combine conditions with AND or OR | Rows that match the group | Missing | P1 |
| 11 | Set the merchant | Clean merchant name on the row | Works | |
| 12 | Set the category | Category on the row | Works | |
| 13 | Add tags | Tags on the row | Works | |
| 14 | Mark reviewed | Row is reviewed | Works | |
| 15 | Set the type, for example transfer | Row is a transfer. It leaves spending totals. | Missing | A card payment needs this rule action |
| 16 | Set notes | Notes on the row | Missing | P2 |
| 17 | Preview a rule before it applies | A list of the rows that match | Partial | The UI shows a count. The API returns the rows. |
| 18 | Apply a rule to past rows | The count of changed rows | Works | |
| 19 | Undo an apply | Old values return | Works | Only for a manual apply |
| 20 | Run all rules on new rows from a sync or an import | New rows classify | Works | |
| 21 | Undo the changes of one sync | Old values return | Missing | New-row runs write no execution record |
| 22 | Set the order of rules | A rule moves up or down | Missing | Today the order is the rule id. A later rule wins. |
| 23 | See the rule that changed a row | Rule id and old values on the row | Missing | See PRD 08 |
| 24 | See the list of clean merchants with row counts | One line for each merchant | Missing | |
| 25 | Rename or merge two merchants | A rule saves, and past rows update | Missing | A merge writes a rule |
| 26 | Skip rows that the user edited | The row does not change | Works | `user_edited` |

## Decision to make

The old PRD says the first matching rule wins for each field. The code says the last matching rule wins. Pick one and write it in the rules screen. Recommendation: keep "last wins" and show the order in the list. A specific rule goes below a general rule.

## Result

The user fixes a messy merchant one time. All past and future rows with that text show the clean name. A card payment rule removes transfers from spending.

## Acceptance criteria

- A second run with the same rules and data changes nothing.
- A rule never changes a row with `user_edited`.
- A bulk apply can undo as one action.
- The original description is never overwritten.
- The preview shows the same rows that the apply changes.

## Gaps to build

1. Edit a rule.
2. A "set type" action, for transfers.
3. Make a rule from a transaction (PRD 04).
4. Merchant list, rename, and merge.
5. Rule order controls.
6. A record and undo for sync runs.
7. More condition types, then AND and OR.
