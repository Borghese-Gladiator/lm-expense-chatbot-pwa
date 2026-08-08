"""GET /api/results/{id} and /api/results/{id}/rows routers."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.analytics.result_registry import ResultRegistry
from app.api.deps import get_registry
from app.models.queries import QueryResult

router = APIRouter()


@router.get("/api/results/{result_id}", response_model=QueryResult)
async def get_result(
    result_id: str,
    registry: ResultRegistry = Depends(get_registry),
) -> QueryResult:
    try:
        return registry.get(result_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


@router.get("/api/results/{result_id}/rows", response_model=QueryResult)
async def get_result_rows(
    result_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    registry: ResultRegistry = Depends(get_registry),
) -> QueryResult:
    try:
        return registry.get_rows(result_id, offset, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
