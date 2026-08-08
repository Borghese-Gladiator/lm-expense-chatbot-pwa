"""FastAPI app factory: lifespan wiring for the shared httpx client + DuckDB + agent."""

from __future__ import annotations

import contextlib
import pathlib
from collections.abc import AsyncIterator

import httpx
from anthropic import AsyncAnthropic
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.agent.analyst import AnalystAgent
from app.analytics.database import get_connection
from app.analytics.query_validator import ValidatorLimits
from app.analytics.result_registry import ResultRegistry
from app.api import health, query, results, sync
from app.config import Settings, get_settings
from app.lunchmoney.client import LunchMoneyClient

FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend"


def _build_limits(settings: Settings) -> ValidatorLimits:
    return ValidatorLimits(
        max_rows=settings.max_rows,
        max_bytes=settings.max_bytes,
        max_time_ms=settings.max_time_ms,
    )


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    http = httpx.AsyncClient(timeout=settings.http_timeout_seconds)
    db = get_connection(settings.duckdb_path)
    limits = _build_limits(settings)
    registry = ResultRegistry(db, limits)
    lm_client = LunchMoneyClient(http, settings.lunchmoney_token, settings.http_timeout_seconds)
    anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key.get_secret_value())
    agent = AnalystAgent(
        anthropic_client, db, registry, limits, settings.model, settings.base_currency
    )

    app.state.http = http
    app.state.db = db
    app.state.registry = registry
    app.state.lm_client = lm_client
    app.state.agent = agent

    try:
        yield
    finally:
        await http.aclose()
        db.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Finance Analyst", lifespan=lifespan)
    app.include_router(sync.router)
    app.include_router(query.router)
    app.include_router(results.router)
    app.include_router(health.router)

    if FRONTEND_DIR.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    return app


app = create_app()
