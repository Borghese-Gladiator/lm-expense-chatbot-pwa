"""Read-only LunchMoney API client over one shared httpx.AsyncClient.

The access token is held as a SecretStr and injected only into the Authorization
header. It is never logged, never placed in exception messages, and never returned.
"""

from __future__ import annotations

import asyncio
import datetime
from collections.abc import AsyncIterator
from typing import Any

import httpx
from pydantic import SecretStr

BASE_URL = "https://dev.lunchmoney.app"
MAX_RETRIES = 4


class LunchMoneyError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class LunchMoneyAuthError(LunchMoneyError):
    """401/403 auth failure. Never carries the token."""


class LunchMoneyRateLimitError(LunchMoneyError):
    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message, status_code=429)
        self.retry_after = retry_after


class LunchMoneyClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        token: SecretStr,
        timeout: float = 30.0,
    ) -> None:
        self._http = http
        self._token = token
        self._timeout = timeout

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token.get_secret_value()}",
            "Accept": "application/json",
        }

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{BASE_URL}{path}"
        last_exc: LunchMoneyError | None = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = await self._http.get(
                    url,
                    params=params,
                    headers=self._headers,
                    timeout=self._timeout,
                )
            except httpx.TimeoutException:
                last_exc = LunchMoneyError(f"request to {path} timed out")
                await self._backoff(attempt)
                continue
            except httpx.HTTPError:
                raise LunchMoneyError(f"transport error contacting {path}") from None

            if resp.status_code in (401, 403):
                raise LunchMoneyAuthError(
                    f"authentication failed for {path} (status {resp.status_code})",
                    status_code=resp.status_code,
                )
            if resp.status_code == 429:
                retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(retry_after if retry_after is not None else 2**attempt)
                    continue
                raise LunchMoneyRateLimitError(
                    f"rate limited on {path}", retry_after=retry_after
                )
            if 500 <= resp.status_code < 600:
                last_exc = LunchMoneyError(
                    f"server error {resp.status_code} on {path}", status_code=resp.status_code
                )
                if attempt < MAX_RETRIES - 1:
                    await self._backoff(attempt)
                    continue
                raise last_exc
            if resp.status_code >= 400:
                raise LunchMoneyError(
                    f"client error {resp.status_code} on {path}", status_code=resp.status_code
                )

            body = resp.json()
            if isinstance(body, dict) and body.get("error"):
                raise LunchMoneyError(f"API error on {path}: {body['error']}")
            return body if isinstance(body, dict) else {"data": body}

        if last_exc is not None:
            raise last_exc
        raise LunchMoneyError(f"request to {path} failed after {MAX_RETRIES} attempts")

    @staticmethod
    async def _backoff(attempt: int) -> None:
        await asyncio.sleep(min(2**attempt, 8))

    async def _paginate(
        self, path: str, params: dict[str, Any], data_key: str
    ) -> AsyncIterator[dict[str, Any]]:
        offset = 0
        limit = int(params.get("limit", 500))
        while True:
            page_params = {**params, "offset": offset, "limit": limit}
            body = await self._get(path, page_params)
            records = body.get(data_key, [])
            for record in records:
                yield record
            has_more = bool(body.get("has_more", False))
            if not has_more or not records:
                break
            offset += len(records)

    async def get_transactions(
        self, start: datetime.date, end: datetime.date
    ) -> list[dict[str, Any]]:
        params = {"start_date": start.isoformat(), "end_date": end.isoformat()}
        return [r async for r in self._paginate("/v1/transactions", params, "transactions")]

    async def get_accounts(self) -> list[dict[str, Any]]:
        assets_body = await self._get("/v1/assets")
        plaid_body = await self._get("/v1/plaid_accounts")
        accounts: list[dict[str, Any]] = []
        for a in assets_body.get("assets", []):
            accounts.append({**a, "source": "manual"})
        for p in plaid_body.get("plaid_accounts", []):
            accounts.append({**p, "source": "plaid"})
        return accounts

    async def get_categories(self) -> list[dict[str, Any]]:
        body = await self._get("/v1/categories")
        return body.get("categories", [])

    async def get_tags(self) -> list[dict[str, Any]]:
        body = await self._get("/v1/tags")
        data = body.get("data", body)
        return data if isinstance(data, list) else body.get("tags", [])

    async def get_budgets(
        self, start: datetime.date, end: datetime.date
    ) -> list[dict[str, Any]]:
        params = {"start_date": start.isoformat(), "end_date": end.isoformat()}
        body = await self._get("/v1/budgets", params)
        data = body.get("data", body)
        return data if isinstance(data, list) else body.get("budgets", [])


def _parse_retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None
