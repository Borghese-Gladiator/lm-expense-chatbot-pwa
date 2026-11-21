# v0.0.1: expense-tracker (archived)

Imported from `Borghese-Gladiator/expense-tracker` (May to Nov 2024) with its full git history
(`git subtree`, no squash), so `git log -- poc_v0.0.1` shows how it evolved. The standalone repo was deleted after this import.
The original README is kept as [README.md](./README.md).

## What it was
- A report generator, not a chatbot: Streamlit and Dash pages showing last month's transactions and
  category, merchant and location graphs, plus year to date. The Dash page could download a PNG to send to family.
- `expense_tracker/`: a Python package with a `LunchMoneyDatasource` (behind a `BaseDatasource`),
  typed models in `et_types/`, and a `StatisticService`, with unit tests in `tests/`.
- `client/`: the apps, Dockerfiles, and Kubernetes deployment/service manifests.
- `zscripts/`: one-off scripts for pulling and uploading Lunch Money transactions and extracting transaction
  tables from bank PDFs and CSVs.

## Approach and lessons
- Dash was easier than Streamlit for building reports (icons, customization, PNG export).
- Data access was split from statistics via a datasource interface. The idea carried forward into later versions.
- Reports were fixed and predefined. That limit is what led to the chat approach in `poc_v0.1/` and `app_v0.2/`,
  and then to the Plaid-backed `app/`.

## Running it
Not maintained. It needs Poetry and a `LUNCH_MONEY_API_KEY`. See the original README.

Tagged in this repo as `archive/expense-tracker-v0.0.1`.
