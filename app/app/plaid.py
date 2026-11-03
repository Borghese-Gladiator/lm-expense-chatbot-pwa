"""Plaid adapter: Link token, token exchange, accounts, and cursor-based /transactions/sync.

Plaid amounts are positive for money out. This app stores negative for money out.
The access token is encrypted at rest and never leaves the server.
"""

from __future__ import annotations

import json
from typing import Any

import duckdb
import httpx

from app.config import Settings
from app.crypto import decrypt, encrypt
from app.db import category_id_for, rows, scalar

HOSTS = {"sandbox": "https://sandbox.plaid.com", "production": "https://production.plaid.com"}
MAX_RESTARTS = 3


class PlaidError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class PlaidClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None) -> None:
        self._settings = settings
        self._http = http or httpx.Client(timeout=30)

    @property
    def configured(self) -> bool:
        return bool(self._settings.plaid_client_id and self._settings.plaid_secret.get_secret_value())

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            raise PlaidError("NOT_CONFIGURED", "set PLAID_CLIENT_ID and PLAID_SECRET")
        payload = {
            "client_id": self._settings.plaid_client_id,
            "secret": self._settings.plaid_secret.get_secret_value(),
            **body,
        }
        try:
            resp = self._http.post(f"{HOSTS[self._settings.plaid_env]}{path}", json=payload)
        except httpx.HTTPError:
            raise PlaidError("NETWORK_ERROR", f"could not reach Plaid ({path})") from None
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise PlaidError(
                str(data.get("error_code", resp.status_code)),
                str(data.get("error_message", "Plaid request failed")),
            )
        return data


def create_link_token(client: PlaidClient) -> str:
    data = client.post(
        "/link/token/create",
        {
            "client_name": "Ledgerlens",
            "language": "en",
            "country_codes": ["US", "CA"],
            "user": {"client_user_id": "owner"},
            "products": ["transactions"],
            "transactions": {"days_requested": 730},
        },
    )
    return str(data["link_token"])


def exchange_public_token(
    db: duckdb.DuckDBPyConnection, client: PlaidClient, public_token: str, institution: str | None
) -> int:
    data = client.post("/item/public_token/exchange", {"public_token": public_token})
    token_enc = encrypt(data["access_token"], client._settings.app_secret_key)
    item_pk = int(
        scalar(
            db,
            """INSERT INTO plaid_items (item_id, institution, access_token_enc) VALUES (?, ?, ?)
               ON CONFLICT (item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc,
                 status = 'ok', error = NULL
               RETURNING id""",
            [data["item_id"], institution, token_enc],
        )
    )
    return item_pk


def _upsert_accounts(
    db: duckdb.DuckDBPyConnection, item_pk: int, institution: str | None, accounts: list[dict]
) -> None:
    for a in accounts:
        bal = a.get("balances") or {}
        db.execute(
            """INSERT INTO accounts (name, type, institution, source, source_id, plaid_item_id,
                                     currency, balance, balance_at)
               VALUES (?, ?, ?, 'plaid', ?, ?, ?, ?, current_timestamp)
               ON CONFLICT (source, source_id) DO UPDATE SET
                 balance = excluded.balance, balance_at = excluded.balance_at,
                 type = excluded.type""",
            [
                a.get("official_name") or a.get("name") or "Account",
                a.get("subtype") or a.get("type") or "other",
                institution,
                a["account_id"],
                item_pk,
                (bal.get("iso_currency_code") or "USD").upper(),
                bal.get("current"),
            ],
        )


def _title(code: str) -> str:
    return code.replace("_", " ").title()


def _category(db: duckdb.DuckDBPyConnection, t: dict[str, Any]) -> int | None:
    pfc = t.get("personal_finance_category") or {}
    primary, detailed = pfc.get("primary"), pfc.get("detailed")
    if not primary:
        return None
    name = detailed[len(primary) + 1 :] if detailed and detailed.startswith(primary + "_") else primary
    return category_id_for(db, _title(name), _title(primary))


def _account_pk(db: duckdb.DuckDBPyConnection, plaid_account_id: str) -> int | None:
    pk = scalar(db, "SELECT id FROM accounts WHERE source = 'plaid' AND source_id = ?", [plaid_account_id])
    return int(pk) if pk is not None else None


def _fetch_all(client: PlaidClient, token: str, cursor: str | None) -> dict[str, Any]:
    for _ in range(MAX_RESTARTS):
        added: list[dict] = []
        modified: list[dict] = []
        removed: list[dict] = []
        accounts: list[dict] = []
        next_cursor = cursor
        try:
            while True:
                body: dict[str, Any] = {"access_token": token, "count": 500}
                if next_cursor:
                    body["cursor"] = next_cursor
                page = client.post("/transactions/sync", body)
                added += page.get("added", [])
                modified += page.get("modified", [])
                removed += page.get("removed", [])
                accounts = page.get("accounts", accounts)
                next_cursor = page["next_cursor"]
                if not page.get("has_more"):
                    return {
                        "added": added,
                        "modified": modified,
                        "removed": removed,
                        "accounts": accounts,
                        "cursor": next_cursor,
                    }
        except PlaidError as exc:
            if exc.code != "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
                raise
    raise PlaidError("SYNC_RESTART_LIMIT", "Plaid data kept changing during sync; try again")


def _apply(db: duckdb.DuckDBPyConnection, data: dict[str, Any]) -> tuple[int, int, int]:
    added = modified = removed = 0
    for t in data["added"]:
        account = _account_pk(db, t["account_id"])
        if account is None:
            continue
        carry: dict[str, Any] = {}
        pending_id = t.get("pending_transaction_id")
        if pending_id:
            prior = rows(
                db,
                """SELECT category_id, merchant, tags, notes, type, reviewed FROM transactions
                   WHERE source = 'plaid' AND source_id = ? AND user_edited""",
                [pending_id],
            )
            carry = prior[0] if prior else {}
        category = carry.get("category_id") if carry else _category(db, t)
        merchant = carry.get("merchant") if carry else (t.get("merchant_name") or t.get("name"))
        db.execute(
            """INSERT INTO transactions
               (source, source_id, account_id, date, amount, currency, payee_raw, merchant,
                category_id, tags, notes, type, is_pending, reviewed, user_edited, raw)
               VALUES ('plaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (source, source_id) DO NOTHING""",
            [
                t["transaction_id"],
                account,
                t["date"],
                -float(t["amount"]),
                (t.get("iso_currency_code") or "USD").upper(),
                t.get("name"),
                merchant,
                category,
                carry.get("tags") or [],
                carry.get("notes"),
                carry.get("type"),
                bool(t.get("pending")),
                bool(carry.get("reviewed")),
                bool(carry),
                json.dumps(t),
            ],
        )
        added += 1
    for t in data["modified"]:
        db.execute(
            """UPDATE transactions SET
                 date = ?, amount = ?, payee_raw = ?, is_pending = ?, raw = ?,
                 updated_at = current_timestamp,
                 merchant = CASE WHEN user_edited THEN merchant ELSE ? END,
                 category_id = CASE WHEN user_edited THEN category_id ELSE ? END
               WHERE source = 'plaid' AND source_id = ?""",
            [
                t["date"],
                -float(t["amount"]),
                t.get("name"),
                bool(t.get("pending")),
                json.dumps(t),
                t.get("merchant_name") or t.get("name"),
                _category(db, t),
                t["transaction_id"],
            ],
        )
        modified += 1
    for r in data["removed"]:
        db.execute(
            "DELETE FROM transactions WHERE source = 'plaid' AND source_id = ?",
            [r["transaction_id"]],
        )
        removed += 1
    return added, modified, removed


def sync_item(db: duckdb.DuckDBPyConnection, client: PlaidClient, item_pk: int) -> dict[str, Any]:
    item = rows(db, "SELECT * FROM plaid_items WHERE id = ?", [item_pk])[0]
    run_id = scalar(
        db,
        "INSERT INTO sync_runs (source, plaid_item_id) VALUES ('plaid', ?) RETURNING id",
        [item_pk],
    )
    try:
        token = decrypt(item["access_token_enc"], client._settings.app_secret_key)
        accounts = client.post("/accounts/get", {"access_token": token}).get("accounts", [])
        data = _fetch_all(client, token, item["cursor"])
        db.execute("BEGIN TRANSACTION")
        try:
            _upsert_accounts(db, item_pk, item["institution"], data["accounts"] or accounts)
            counts = _apply(db, data)
            db.execute(
                "UPDATE plaid_items SET cursor = ?, status = 'ok', error = NULL WHERE id = ?",
                [data["cursor"], item_pk],
            )
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise
    except PlaidError as exc:
        status = "reconnect" if exc.code == "ITEM_LOGIN_REQUIRED" else "error"
        db.execute("UPDATE plaid_items SET status = ?, error = ? WHERE id = ?", [status, str(exc), item_pk])
        db.execute(
            """UPDATE sync_runs SET status = 'error', error = ?, finished_at = current_timestamp
               WHERE id = ?""",
            [str(exc), run_id],
        )
        raise
    db.execute(
        """UPDATE sync_runs SET status = 'ok', added = ?, modified = ?, removed = ?,
             finished_at = current_timestamp WHERE id = ?""",
        [*counts, run_id],
    )
    return {"added": counts[0], "modified": counts[1], "removed": counts[2]}
