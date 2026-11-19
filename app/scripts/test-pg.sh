#!/usr/bin/env bash
set -euo pipefail
name=spend-it-pg
port=${TEST_PG_PORT:-55432}
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --rm --name "$name" -e POSTGRES_USER=spend -e POSTGRES_PASSWORD=spend -e POSTGRES_DB=spend_test -p "$port:5432" postgres:17-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
until docker exec "$name" pg_isready -U spend -d spend_test >/dev/null 2>&1; do sleep 1; done
TEST_DATABASE_URL="postgres://spend:spend@localhost:$port/spend_test" npx vitest run --no-file-parallelism "$@"
