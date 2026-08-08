"""Shared FastAPI dependencies pulling wired singletons off app.state."""

from __future__ import annotations

import duckdb
from fastapi import Request

from app.agent.analyst import AnalystAgent
from app.analytics.result_registry import ResultRegistry
from app.lunchmoney.client import LunchMoneyClient


def get_client(request: Request) -> LunchMoneyClient:
    return request.app.state.lm_client


def get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db


def get_agent(request: Request) -> AnalystAgent:
    return request.app.state.agent


def get_registry(request: Request) -> ResultRegistry:
    return request.app.state.registry
