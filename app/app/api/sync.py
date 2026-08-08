"""POST /api/sync router."""

from __future__ import annotations

import datetime

import duckdb
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_client, get_db
from app.config import get_settings
from app.lunchmoney.client import LunchMoneyClient, LunchMoneyError
from app.lunchmoney.sync import sync_snapshot
from app.models.queries import SyncRequest, SyncResult

router = APIRouter()


@router.post("/api/sync", response_model=SyncResult)
async def post_sync(
    body: SyncRequest,
    client: LunchMoneyClient = Depends(get_client),
    db: duckdb.DuckDBPyConnection = Depends(get_db),
) -> SyncResult:
    today = datetime.date.today()
    end = body.end or today
    start = body.start or (end - datetime.timedelta(days=365))
    if start > end:
        raise HTTPException(status_code=422, detail="start must be <= end")
    settings = get_settings()
    try:
        return await sync_snapshot(client, db, start, end, settings.base_currency)
    except LunchMoneyError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
