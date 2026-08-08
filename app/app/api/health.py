"""GET /api/health router."""

from __future__ import annotations

from typing import Any

import duckdb
from fastapi import APIRouter, Depends

from app.api.deps import get_db
from app.lunchmoney.sync import get_last_synced_at

router = APIRouter()


@router.get("/api/health")
async def get_health(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    try:
        row = db.execute("SELECT COUNT(*) FROM analytics.transactions").fetchone()
        txn_count = int(row[0]) if row else 0
        db_ok = True
    except duckdb.Error:
        txn_count = 0
        db_ok = False
    last_synced = get_last_synced_at()
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "transaction_count": txn_count,
        "last_synced_at": last_synced.isoformat() if last_synced else None,
    }
