# Usage PRDs

Each PRD describes one use of Spend Lens. It has a user, a goal, steps, and a result that the user must see.

Spend Lens tracks expenses. It has no budgets, no goals, no bill payment, no net worth, no recurring items, no transfer matching, and no multi-currency. All amounts are USD.

## Status key

| Status | Meaning |
|---|---|
| Works | Code exists for the step. |
| Partial | Some of the step exists. The Notes column names the gap. |
| Missing | No code exists. |
| Verify | The code does not show if the step works. Test it in the browser. |

Statuses come from a read of the code on branch `main`. No status is a browser result. The bug bash checks each status in the browser.

## List

| # | PRD | Goal |
|---|---|---|
| 01 | [Monthly spending review](01-monthly-spending-review.md) | Know where the money went |
| 02 | [Spending change analysis](02-spending-change-analysis.md) | Know why spending changed |
| 03 | [Trip cost report](03-trip-cost-report.md) | Know what a trip cost |
| 04 | [New transaction triage](04-new-transaction-triage.md) | Clean new rows after a sync |
| 05 | [Rules and merchant normalization](05-rules-and-merchants.md) | Classify rows automatically |
| 06 | [Split transactions](06-split-transactions.md) | Divide one charge across categories |
| 07 | [Bank connection and sync](07-bank-connection-and-sync.md) | Keep data current |
| 08 | [Change history](08-change-history.md) | See and undo each change |
| 09 | [Ask](09-ask.md) | Get an answer in plain words |
| 10 | [Phone use as a PWA](10-phone-pwa.md) | Use the app on a phone |

## Shared rules

- Each number traces to its transactions.
- A transfer never counts as spending.
- A refund reduces spending.
- A manual edit is never lost to a rule or a sync.
- A negative amount is money out.
