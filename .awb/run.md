# Run file for Spend Lens

## setup
```sh
npm ci --prefix app
```

## start
```sh
cd app && npm run build && export PGLITE_DIR="$(mktemp -d)/pglite" ANTHROPIC_API_KEY= PLAID_CLIENT_ID= APP_PASSWORD= && npm run seed && exec npx next start -p {port}
```
url: http://127.0.0.1:{port}
ready: /api/health

## test
```sh
cd app && npx vitest run --reporter=junit --outputFile={report} {tests}
```
