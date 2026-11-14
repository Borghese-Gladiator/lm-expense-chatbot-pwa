# Spend Lens (SL)

A standalone, analytics-first personal finance app. It has no budgets. It focuses on transactions you can explain:
every number opens the transactions behind it.

- **Data in:** Plaid bank sync (manual and a daily cron), CSV import (including the Lunch Money export), and manual entry. The app does not depend on another finance app.
- **Analysis:** Overview, the Explore query builder (measure × metric × up to 2 dimensions × filters × period comparison), drill-down, one-off exclusion, and saved analyses.
- **Organization:** search, inline and bulk edits, categories with groups and kinds, tags, notes, a reviewed flag, and CSV export.
- **Ask (optional):** a question in plain language becomes a structured query that you can check and change. The model gets names only (categories, accounts, tags, merchants), never transactions.

## Stack

One Next.js app. It deploys to Vercel with no settings change, because the Vercel project builds `app/`.

```
src/app/            Next.js shell: layout, page, and one catch-all API route
src/proxy.ts        password check on every request (see Security)
src/server/
  db.ts             schema + `reportable` view; Postgres (DATABASE_URL) or PGlite (local)
  analytics.ts      AnalyticsQuery -> parameterized SQL, comparison, drill-down
  csv.ts            header aliases, debit/credit columns, idempotent dedupe
  plaid.ts          Link, token exchange, cursor /transactions/sync
  crypto.ts         AES-256-GCM encryption for Plaid access tokens
  ask.ts            question -> AnalyticsQuery (structured output)
  api.ts            all API routes and the daily sync
src/web/            React client: Overview, Explore, Transactions, Accounts, Settings
tests/              analytics semantics, CSV import, Plaid sync, API, auth
scripts/seed-demo.ts
```

## Run on your machine

```bash
npm run setup    # install, make .env with new secrets, seed 2 years of fake data
npm run dev      # http://localhost:3000
```

`npm run setup` does not change an existing `.env`, and it seeds only an empty database.

With no `DATABASE_URL`, the app keeps its data in PGlite (Postgres in the Node process) in `.data/pglite`.
Run `npm run dev` or `npm run seed` one at a time, because PGlite opens the folder for one process only.

## Deploy to Vercel

1. In the Vercel project, open **Storage** and add a **Neon** Postgres database. This sets `DATABASE_URL`.
2. In **Settings → Environment Variables**, set `APP_PASSWORD` and `ROOT_SECRET`. To let Vercel Cron call the sync, also set `CRON_SECRET`, because Vercel sends only that variable. Add the Plaid and Anthropic keys if you use them.
3. Deploy. The tables are made on the first request.

`vercel.json` runs `/api/cron/sync` one time each day (the Hobby plan limit). Vercel sends `CRON_SECRET` with the request.

## Configuration

| Variable | Use | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection. The schema setup always uses it. | empty = PGlite |
| `DATABASE_URL_POOLED` | Pooled Postgres connection (for example Neon `-pooler`) for queries | `DATABASE_URL` |
| `PGLITE_DIR` | PGlite data folder | `.data/pglite` |
| `APP_PASSWORD` | Shared password. Required on Vercel. | — |
| `ROOT_SECRET` | Root secret. The app derives `APP_SECRET_KEY` and `CRON_SECRET` from it when they are not set. Do not change it after you connect a bank. | — |
| `CRON_SECRET` | Lets Vercel Cron call `/api/cron/sync` | derived from `ROOT_SECRET` |
| `APP_SECRET_KEY` | Encrypts bank tokens (16+ characters). If you set it before, keep it, so that stored bank tokens stay readable. | derived from `ROOT_SECRET` |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid keys | — |
| `PLAID_ENV` | `sandbox` or `production` | `sandbox` |
| `ANTHROPIC_API_KEY` | Turns on Ask | — |
| `MODEL` | Model for Ask | `claude-opus-5-5` |
| `CURRENCY` | Reporting currency | `USD` |

## Security

- The `/login` page asks for `APP_PASSWORD`. A correct password sets a signed `HttpOnly` cookie for 30 days. **Sign out** clears it. To sign out all browsers, change `APP_PASSWORD`.
- On Vercel, if `APP_PASSWORD` is not set, every request gets a 503. The bank data never becomes public by mistake.
- Without `APP_PASSWORD` on your machine, the app is open, so that local development is simple.
- `/api/cron/sync` accepts only `Authorization: Bearer $CRON_SECRET`. The app password does not open it.
- All users share one data set. Give the password only to people who can see all of it.

To move from Lunch Money, export your transactions as CSV in Lunch Money. Then import the file on the Accounts page. The import creates accounts, categories, and groups by name. A second import of the same file adds nothing.

## How totals work

- A negative amount is money out. **Spending** is expenses with the sign flipped, so a refund reduces spending.
- **Transfers** and **adjustments** never count toward spending, income, or net. A category's kind sets the type, and a type that you set on a transaction wins.
- **Pending** transactions and categories marked "exclude" are left out unless you include them.
- When a transaction is split, only the child rows count, so the parent is not counted two times.
- **Previous period** for a full calendar month (or a run of full months) is the same number of calendar months before it. For any other range, it is a range of the same length that ends the day before.

## Checks

```bash
npm test             # vitest, in-memory PGlite
npm run check-types
npm run build        # the Vercel build
```
