"""POST /api/query router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.agent.analyst import AnalystAgent
from app.api.deps import get_agent
from app.lunchmoney.sync import get_last_synced_at
from app.models.queries import AnswerEnvelope, QueryRequest

router = APIRouter()


@router.post("/api/query", response_model=AnswerEnvelope)
async def post_query(
    req: QueryRequest,
    agent: AnalystAgent = Depends(get_agent),
) -> AnswerEnvelope:
    try:
        return await agent.answer(
            req.question, req.result_id, get_last_synced_at()
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
