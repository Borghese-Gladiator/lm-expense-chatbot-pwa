# PRD: Analytics-First Personal Finance App (Ledgerlens)

**Status:** Draft v0.3
**Product type:** Standalone personal finance application
**Audience:** One user first. Multi-user support is a future option.
**Direction:** A full replacement for Lunch Money

The next work items are in [docs/TODO.md](docs/TODO.md). This document says what the product must do. The TODO file says what to build next.

## 1. Product vision

Ledgerlens has the transaction management and automation of Lunch Money. Its analytics are much stronger.

The user connects banks, imports transactions, manages categories, automates classification, and explores the data in interactive reports. The product has no budgets. It answers three questions:

1. Where did my money go?
2. How did my spending change?
3. How much did a specific activity, event, or trip cost?

**Key differentiator:** Reports use the usual classifications (categories, merchants). Reports also use real-world contexts (trips, events, projects). The user does not change transaction categories to get a context report.

**Product rule:** Each number must be explainable, filterable, and traceable to its transactions.

## 2. Scope

### In scope

- Direct bank and credit card integration through Plaid
- A one-time import of Lunch Money data, for migration only
- Manual transactions and CSV import
- Categories, category groups, and tags
- A custom rules engine
- Merchant normalization
- Split transactions
- Correct treatment of transfers and refunds
- Recurring transaction tracking
- Account management and sync monitoring

The app must work fully after the user disconnects or cancels Lunch Money.

### Out of scope

- Budgets, spend limits, and envelopes
- Savings goals
- Budget notifications and warnings
- Bill payment or money transfers
- Investment trading
- Financial planning advice

## 3. Status key

Each requirement has a status. The status shows the state of the code on branch `worktree-analytics-platform-phase-0-1`.

| Status | Meaning |
|---|---|
| Built | Done and covered by tests or a browser check |
| Partial | Some of the requirement is done. The gap is in the Notes column. |
| Not started | No code yet |

Priority: **P0** is necessary for the first standalone release. **P1** follows soon after. **P2** is for later.

## 4. Navigation

| Page | Purpose | Status |
|---|---|---|
| Overview | High-level spending and income analytics | Built |
| Explore | Interactive analysis, including year-over-year | Built |
| Transactions | Search, organize, edit, and review | Built |
| Trips | Manage trips and their expenses | Not started |
| Recurring | Subscriptions and recurring spending | Not started |
| Rules | Automatic transaction classification | Not started |
| Accounts | Bank connections, manual accounts, CSV import, sync history | Built |
| Settings | Categories, tags, merchants, currency, data export and deletion | Partial: categories and data deletion only |

**Decision:** Year-over-year analysis is a mode of Explore, not a separate page. It uses the same query engine, filters, and drill-down.

---

## 5. Feature A: Spending Explorer (P0)

### User story

As a user, I want to see how much I spent over the last three months. I want to find my largest categories and see what changed over time.

### Screen layout

- **Header:** a date preset, a comparison selector (Previous period, Same period last year, Custom, None), filters (accounts, categories, groups, merchants, tags, trips, types), and Save.
- **Summary metrics:** total spending, average monthly spending, change against the comparison period, and the transaction count.
- **Main chart:** monthly spending. Alternate views: stacked by category, daily, weekly, by merchant, and a treemap.
- **Breakdown table:** each row shows the current value, the previous value, the change, the percent change, and the share of the total change.

A click on a row or a chart mark opens the transactions behind it.

### Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| EXP-01 | Presets: last 30 days, last 90 days, last 3 complete months, year to date, last 12 months, custom range | Partial | "Last 3 months" and "Last 12 months" include the current partial month. There are no rolling 30 or 90 day presets. |
| EXP-02 | Show clearly whether a period is rolling (90 days) or calendar (3 months) | Not started | |
| EXP-03 | Daily, weekly, monthly, quarterly, and yearly aggregation | Built | |
| EXP-04 | Configurable comparison periods | Built | A full calendar month compares to the previous calendar months. Other ranges compare to a range of the same length. |
| EXP-05 | Filters that apply together across categories, accounts, merchants, tags, trips, and types | Partial | Trips are not available. |
| EXP-06 | Absolute and percent change | Built | |
| EXP-07 | Drill down from metric to category, to merchant, to transaction | Partial | Drill-down to transactions works. A category to merchant step is not available. |
| EXP-08 | Save and reopen reports | Built | |
| EXP-09 | Exclude transactions or categories from the current analysis only | Partial | Transactions only. Category exclusion is not available. |
| EXP-10 | Summary metric cards on Explore | Partial | Overview has cards. Explore shows only one summary line. |

### Acceptance criteria

- The user can answer "How much did I spend over the last three complete months?" in two clicks or fewer from Explore.
- The user can find the category that caused most of an increase.
- A click on any reported number shows its transactions.
- Filters apply the same way to cards, charts, and tables.

---

## 6. Feature B: Year-over-year analysis (P0)

### User story

As a user, I want to compare this year with last year. I want to see which categories change, and separate real changes from one-time expenses.

### Screen layout

- **Header:** current year against a previous year, the metric, monthly granularity, and optional filters.
- **Main chart:** two lines, one for each year, aligned by calendar month.
- **Summary metrics:** current period, previous comparable period, absolute difference, percent change.
- **Breakdown:** categories ranked by their share of the change, with drill-down to merchant and then to transaction.

### Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| YOY-01 | Compare a year with any previous year that has data | Built | Use a custom comparison. |
| YOY-02 | Full-year and year-to-date comparisons | Partial | The YTD preset with "Same period last year" works. "Previous period" with YTD gives a range that is not useful. |
| YOY-03 | Compare equal elapsed periods by default (Jan 1 to Nov 3 against Jan 1 to Nov 3 of the previous year) | Partial | Correct with "Same period last year". It is not the default for YTD. |
| YOY-04 | A monthly chart that shows both years together | Not started | See the approach in TODO. |
| YOY-05 | Change in spending composition by category and merchant | Built | |
| YOY-06 | Exclude unusual purchases for the current analysis | Built | |
| YOY-07 | Compare trips, recurring spending, and discretionary spending | Not started | Depends on Trips and Recurring. |
| YOY-08 | Inflation-adjusted amounts | Not started | P2 |

### Acceptance criteria

- The app never compares a partial year to a complete year without a clear label.
- The user can find the largest causes of the year-over-year difference.
- Reports for past years use the current classifications.
- Each total can be traced to transactions.

---

## 7. Feature C: Trips (P0, flagship)

### Problem

In most finance apps, the user tags vacation expenses by hand, or changes their categories to Travel. This takes time, and it damages the normal category reports.

### Solution

A **trip** is a separate entity. Transactions link to a trip. A transaction keeps its category when it links to a trip. For example, a restaurant expense stays in Dining and also counts toward the trip's food total.

A trip has a name, destinations, start and end dates, an optional description, assigned transactions, suggested transactions, and computed metrics.

### 7.1 Trips list

The list shows past, active, and upcoming trips. Each card shows the destination and dates, the total cost, the transaction count, the number of suggestions to review, and the status.

### 7.2 Create a trip

- **Required:** name, start date, end date.
- **Optional:** destination city and country, description, and a pre-trip window (for example, 90 days) to find advance bookings.

When the user creates a trip, the app finds matching transactions and shows them as suggestions.

### 7.3 Suggestions

The app scores each candidate transaction from these signals:

1. The date is inside the trip dates.
2. The merchant location matches the destination, when the bank supplies a location.
3. The currency matches the destination.
4. The merchant or category is a travel type (airline, hotel, car rental, rideshare, booking site).
5. The transaction is a booking inside the pre-trip window.

The app groups suggestions as high, medium, or low confidence. Each suggestion shows its reason. The user accepts or rejects suggestions one at a time or in bulk.

The app must not assume that all transactions in the trip dates belong to the trip. Recurring charges, bills, rent, and subscriptions stay out unless the user selects them. Location is optional evidence, not a requirement.

### 7.4 Trip summary

- **Header:** name, destination, dates, duration, Edit, Review suggestions.
- **Metrics:** total cost, average daily cost, expense count, refunds and reimbursements.
- **Charts:** spending by category, a daily timeline, the largest expenses, and a merchant breakdown.
- **Transactions:** all assigned transactions with their normal categories.
- **Review:** suggestions with merchant, amount, date, category, reason, and Include / Exclude.

### 7.5 Requirements

All trip requirements are **Not started**.

| ID | Requirement | Priority |
|---|---|---|
| TRIP-01 | Link transactions to trips without a change to categories or tags | P0 |
| TRIP-02 | Allow transactions outside the trip dates (flights, advance hotel bookings) | P0 |
| TRIP-03 | Remove a transaction from a trip without a delete or a category change | P0 |
| TRIP-04 | Show trip expenses by their original categories | P0 |
| TRIP-05 | Leave transfers out of trip totals by default | P0 |
| TRIP-06 | Refunds reduce trip cost | P0 |
| TRIP-07 | Multi-currency trips in one reporting currency | P1 (needs FX rates) |
| TRIP-08 | Keep user-approved links after each bank sync | P0 |
| TRIP-09 | Link part of a transaction to a trip | P1 |
| TRIP-10 | Show gross cost, refunds, reimbursements, and net personal cost separately | P0 |
| TRIP-11 | Compare trips with each other | P2 |
| TRIP-12 | Trip as a filter and a dimension in Explore | P0 |

### Acceptance criteria

- The user can create a trip in less than one minute.
- The user can review and accept suggestions in bulk.
- Restaurant expenses stay in Dining, hotels stay in Lodging, and airfare stays in Airfare.
- The trip total is correct when some purchases happen before the trip.
- Trip links stay after category changes and bank updates.
- No transaction counts two times in the overall totals.

---

## 8. Feature D: Transaction management (P0)

The transaction ledger is the source of truth for all reports.

| Operation | Status | Notes |
|---|---|---|
| Browse and search | Built | Server-side pages of 100 rows |
| Filter by many attributes | Built | |
| Edit merchant, category, type, tags, notes, reviewed | Built | |
| Create and edit categories and groups | Built | In Settings |
| Split a transaction into parts | Partial | The data model supports it (`parent_id`), and reports count only the parts. There is no API or UI to make a split. |
| Bulk edit | Built | Category, reviewed, mark as transfer |
| Find and exclude transfers | Partial | Category kind and the transaction type do this. There is no automatic match of the two sides of a transfer. |
| Manual transactions | Built | |
| CSV import | Built | |
| Review uncategorized and unreviewed transactions | Built | Filters on the Transactions page |
| Link transactions to trips | Not started | |
| Keep a record of manual changes | Partial | A `user_edited` flag and `updated_at` only. There is no change history. |

The transaction detail view must show the source record, the automatic classification, the rules that applied, and the manual changes. Today it shows the source record and the edit flag.

### Merchant normalization (P1, Not started)

Many bank descriptions map to one canonical merchant. For example, `AMZN MKTP`, `AMAZON.COM`, and `Amazon Marketplace` map to Amazon. The original description does not change. The user can edit the mappings, and new transactions use them.

---

## 9. Feature E: Rules engine (P0 basic, P1 advanced, Not started)

### Conditions

Merchant or description text, account, amount, category, date, and transaction type. Conditions combine with AND. AND/OR groups are P1.

### Actions

Set the category, set the merchant, add or remove tags, set the reviewed status, set notes. A future action can suggest a trip, but the user must review trip links.

### Rule management

- Create and edit rules.
- Preview the matches before the rule applies.
- Apply a rule to past transactions.
- Set the order of rules when they conflict. The first match in the order wins for each field.
- Do not change a field that the user edited by hand (`user_edited`).
- Show which rule changed a transaction.
- Undo a bulk application.

The engine must be deterministic and idempotent. A second run with the same rules and data changes nothing.

---

## 10. Feature F: Bank and account integrations (P0)

The app connects to banks directly. Lunch Money is not a data provider at run time.

| ID | Requirement | Status | Notes |
|---|---|---|---|
| BANK-01 | Connect banks through Plaid Link | Built | Not yet tested with real sandbox keys |
| BANK-02 | Exchange tokens on the backend only | Built | Tokens are encrypted at rest. |
| BANK-03 | Get accounts, balances, and transaction history | Built | Plaid returns up to 730 days. |
| BANK-04 | Sync added, modified, and removed transactions | Built | Cursor-based `/transactions/sync` |
| BANK-05 | Pending to posted without double count | Built | User edits move from the pending row to the posted row. |
| BANK-06 | Connection repair and new sign-in | Partial | The app detects `ITEM_LOGIN_REQUIRED`. Plaid Link update mode is not built. |
| BANK-07 | Show the last sync time and connection health | Partial | Sync history and status show. There is no last-sync time on each connection. |
| BANK-08 | CSV fallback for other banks | Built | |
| BANK-09 | Manual accounts | Built | |
| BANK-10 | Adapters for other aggregators | Not started | P2. Add it when a second provider is necessary. |
| BANK-11 | Automatic scheduled sync | Not started | Sync is manual today. |

### Migration from Lunch Money

The migration is one time only. It moves:

| Data | Status | Notes |
|---|---|---|
| Historical transactions | Built | Lunch Money CSV export |
| Accounts | Built | Created by name from the CSV |
| Categories and groups | Built | |
| Tags | Built | |
| Split and grouped transactions | Not started | The CSV export does not keep these links reliably. |
| Recurring items | Not started | |
| Rules | Not planned | The user makes them again in Ledgerlens. |

**Reconciliation (P0, Not started):** When Plaid imports history that the CSV migration already holds, the app must not make duplicates. Each Plaid account must also map to its migrated account. See TODO for the approach.

---

## 11. Data model

| Entity | Purpose | Status |
|---|---|---|
| `plaid_items` | Bank connections (one for each Plaid item) | Built |
| `accounts` | Bank, credit, cash, and manual accounts | Built |
| `transactions` | The ledger. It keeps `source`, `source_id`, and the raw source record (`raw`). | Built |
| `categories` | Primary classification, with `group_name`, `kind`, `exclude_from_totals`, `archived` | Built |
| `sync_runs` | Import and sync history | Built |
| `saved_queries` | Saved Explore reports | Built |
| `merchants`, `merchant_aliases` | Canonical merchants and description mappings | Not started |
| `rules`, `rule_executions` | Rule definitions and an audit of their effects | Not started |
| `trips`, `trip_transactions` | Trips, and links with an optional part amount | Not started |
| `recurring_items` | Confirmed and detected recurring charges | Not started |
| `transaction_sources` | More than one source record for one transaction | Not started. Add it for reconciliation only if a match must keep both records. |

### Model decisions

- **Splits** are child rows in `transactions` with `parent_id`. The `reportable` view removes a parent that has children. A separate allocations table is not necessary.
- **Tags** are a `VARCHAR[]` column on `transactions`. A separate tag table is not necessary for one user. Add one if tags need their own fields (color, archive).
- **Trips are not a category type.** `trip_transactions` links a transaction to a trip and does not use `transactions.category_id`. A transaction counts in its trip report and in its category report, and it counts one time in the overall ledger.
- **Sign convention:** a negative amount is money out. A positive expense is a refund.

---

## 12. Technology

### What is in use

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python 3.10+) |
| Database | DuckDB, one local file |
| Bank data | Plaid REST API over `httpx` |
| Frontend | React 18, Vite, TypeScript |
| Charts | Apache ECharts |
| Optional AI | Anthropic API (`claude-opus-5-5`) for Ask |

**Why not Next.js and PostgreSQL:** For one user, DuckDB is fast for analytical SQL on 50,000 rows, and it needs no server. One process holds the API and the UI, so deployment is simple.

**When to move to PostgreSQL:** when the app has more than one user, or when it runs as a hosted service. The analytics compiler writes standard SQL, so most queries move with small changes.

### Reporting

All reports compile one structured query (`AnalyticsQuery`) into parameterized SQL. The query holds the measure, metric, dimensions, filters, date range, and comparison. Charts, tables, drill-down, saved reports, and Ask use the same query. Dashboard components do not calculate totals themselves.

### AI

The core features do not use an LLM. Sync, rules, merchant normalization, trip suggestions, and all calculations are deterministic.

Ask is optional. It turns a question into an `AnalyticsQuery`. The user sees the query in the Explore controls before relying on it. The model receives only names (categories, accounts, tags, merchants), never transactions or amounts.

---

## 13. Delivery plan

### Milestone 1: Independent financial foundation

Done: schema, Plaid sync, CSV import, Lunch Money CSV migration, manual accounts, ledger and edits, categories.

Remaining: a real Plaid sandbox test, Plaid and CSV reconciliation, scheduled sync, Link update mode, basic rules, authentication.

**Exit criterion:** Daily finance tracking works with no Lunch Money connection.

### Milestone 2: Spending analytics

Done: Overview, Explore, filters, monthly trends, category and merchant breakdowns, period comparison, drill-down, exclusion, saved reports.

Remaining: complete-month and rolling presets, year-over-year overlay chart, YTD comparison default, Explore summary cards, category exclusion.

**Exit criterion:** The app answers the three-month and year-over-year questions.

### Milestone 3: Trip analytics

Trips CRUD, links, suggestions, bulk review, trip summary, pre-trip bookings, trip filter in Explore.

**Exit criterion:** The user gets a trip summary without a change to any category.

### Milestone 4: Automation and polish

Advanced rules, merchant normalization, split UI, recurring items, more chart types, better review flows, change history.

---

## 14. Quality requirements

### Financial correctness

- Transfers and credit card payments never count as spending. **Built**
- Split transactions never count two times. **Built**
- Refunds reduce spending. **Built**
- One clear sign convention. **Built**
- One reporting currency. **Partial:** amounts in other currencies are not converted.
- Correct year-to-date alignment. **Partial**
- Each total traces to its source records. **Built**

### Sync reliability

- Idempotent sync. **Built**
- Persistent Plaid cursors. **Built**
- Recovery from an interrupted sync. **Built:** the cursor saves only after all writes commit.
- Reconnection. **Partial**
- Reconciliation of imported records. **Not started**
- No loss of user edits or trip links in a sync. **Built** for edits

### Security

- Plaid tokens stay on the server and are encrypted at rest. **Built**
- The app never stores bank sign-in credentials. **Built**
- Authentication before any access other than localhost. **Not started.** Do not expose the app on a network until this is done.
- HTTPS for production. **Not started**
- Verified Plaid webhooks, when webhooks are added. **Not started**
- No financial records or secrets in logs. **Built**
- Data export and deletion. **Built:** CSV export and delete-all.

### Performance

Typical interactive reports must return in less than two seconds on 50,000 transactions. **Not measured yet.**

---

## 15. MVP success criteria

1. Direct bank integration works without Lunch Money.
2. The user can categorize and manage imported transactions.
3. Basic rules organize new transactions automatically.
4. Three-month spending shows by category and by month.
5. Year-over-year spending compares accurately.
6. Trips exist as separate entities.
7. The user reviews and assigns trip expenses without a category change.
8. Trip summaries show correct totals and breakdowns.
9. Each reported amount traces to its transactions.
10. The user continues with the app after Lunch Money is disconnected.

**Definition of success:** The app replaces the essential transaction management of Lunch Money. Its spending and trip analytics are clearly better.

## 16. Open decisions

- **Splits and recurring items from Lunch Money:** the CSV export does not keep them. Accept the loss, or write a one-time API migration script. The script runs one time and is then deleted, so the app does not depend on Lunch Money.
- **Multi-currency:** select an FX rate source before TRIP-07.
- **Hosting:** stay on localhost, or deploy for access from a phone. A deployment needs authentication and HTTPS first.
