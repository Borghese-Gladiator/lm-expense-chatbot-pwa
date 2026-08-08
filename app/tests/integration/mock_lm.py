"""A configurable httpx MockTransport emulating the LunchMoney API."""

from __future__ import annotations

import json
from typing import Any

import httpx

from tests.fixtures.lunchmoney_responses import (
    ACCOUNTS_ASSETS,
    ACCOUNTS_PLAID,
    CATEGORIES,
    TAGS,
    scenario_transactions,
)


class MockLM:
    """Emulates the endpoints the client calls, with controllable failures."""

    def __init__(
        self,
        scenario: str,
        page_size: int = 5,
        fail_429_times: int = 0,
        fail_500_times: int = 0,
        require_bearer: str | None = None,
    ) -> None:
        self.scenario = scenario
        self.page_size = page_size
        self.fail_429_times = fail_429_times
        self.fail_500_times = fail_500_times
        self.require_bearer = require_bearer
        self.request_count = 0
        self.seen_auth_headers: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.request_count += 1
        self.seen_auth_headers.append(request.headers.get("authorization", ""))

        if self.require_bearer is not None:
            if request.headers.get("authorization") != f"Bearer {self.require_bearer}":
                return httpx.Response(401, json={"error": "bad token"})

        path = request.url.path

        if path == "/v1/transactions":
            if self.fail_429_times > 0:
                self.fail_429_times -= 1
                return httpx.Response(429, headers={"Retry-After": "0"}, json={})
            if self.fail_500_times > 0:
                self.fail_500_times -= 1
                return httpx.Response(500, json={})
            return self._transactions(request)

        if path == "/v1/assets":
            return httpx.Response(200, json={"assets": ACCOUNTS_ASSETS})
        if path == "/v1/plaid_accounts":
            return httpx.Response(200, json={"plaid_accounts": ACCOUNTS_PLAID})
        if path == "/v1/categories":
            return httpx.Response(200, json={"categories": CATEGORIES})
        if path == "/v1/tags":
            return httpx.Response(200, json={"data": TAGS})
        if path == "/v1/budgets":
            return httpx.Response(200, json={"data": []})

        return httpx.Response(404, json={"error": "not found"})

    def _transactions(self, request: httpx.Request) -> httpx.Response:
        offset = int(request.url.params.get("offset", 0))
        limit = int(request.url.params.get("limit", self.page_size))
        limit = min(limit, self.page_size)
        txns = scenario_transactions(self.scenario)
        chunk = txns[offset : offset + limit]
        has_more = (offset + limit) < len(txns)
        return httpx.Response(
            200, json={"transactions": chunk, "has_more": has_more}
        )

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)


def as_json(response_body: dict[str, Any]) -> str:
    return json.dumps(response_body)
