# PRD 09: Ask

## User and goal

The user is the account owner. The user wants to type a question in plain words and get an answer, for example "How much did I spend on dining in March compared with February?"

## How it works

The model turns the question into one `AnalyticsQuery`. The server runs the query. The app shows the query in the Explore controls. The model never sees transactions or amounts. It sees only names: categories, accounts, tags, and merchants.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open Ask and type a question | A loading state | Works | |
| 2 | Get a chart and a table | The result of the query | Works | |
| 3 | See the query as Explore controls | Period, filters, grouping | Verify | |
| 4 | Change a control and run again | The result updates with no model call | Verify | |
| 5 | Save the result as a report | The report shows in the saved list | Works | |
| 6 | Ask about a trip | The query uses the trip filter | Missing | Needs TRIP-12 |
| 7 | Ask something that is not about spending | A short message that Ask cannot answer | Verify | |
| 8 | Ask with no API key set | A clear message, and the rest of the app works | Verify | |
| 9 | Get a bad query from the model | An error that says the model failed. No crash. | Verify | |
| 10 | Ask many times in a short time | Requests above a limit are refused | Missing | Ask uses a paid API. See the backlog. |

## Test set

Before release, run 10 questions with a real key. Each question must give a valid query that matches the intent.

1. Total spending last month.
2. Spending by category last three complete months.
3. Dining in March against February.
4. Top 10 merchants this year.
5. Spending on one merchant by month.
6. Year to date against the same period last year.
7. Spending in one account.
8. Spending with one tag.
9. Largest single transactions this quarter.
10. Spending by week for the last 90 days.

## Result

The user gets a correct answer in less than 10 seconds. The user can see how the answer was made.

## Acceptance criteria

- The model receives names only.
- Every answer shows its query.
- A wrong query is visible and fixable in the controls.
- A failure of the model never breaks the rest of the app.

## Gaps to build

- The 10-question test with a real key.
- Rate limit on Ask.
- A trip filter in the query schema.
