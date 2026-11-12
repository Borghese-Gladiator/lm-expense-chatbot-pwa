# Run file for Spend Lens

## setup
```sh
uv sync --extra dev
npm ci --prefix frontend
```

## start
```sh
npm run build --prefix frontend && DB="$(mktemp -d)/demo.duckdb" && PYTHONPATH=. uv run python scripts/seed_demo.py "$DB" && DUCKDB_PATH="$DB" ANTHROPIC_API_KEY= PLAID_CLIENT_ID= exec uv run uvicorn app.main:app --port {port}
```
url: http://127.0.0.1:{port}
ready: /api/health

## test
```sh
PYTHONPATH=. uv run --extra dev python -m pytest -q -p no:cacheprovider --junitxml={report} {tests}
```
