import json

import httpx
import pytest
from pydantic import SecretStr

from app import plaid
from app.config import Settings
from app.db import rows, scalar

SETTINGS = Settings(
    plaid_client_id="cid",
    plaid_secret=SecretStr("sec"),
    app_secret_key=SecretStr("x" * 32),
    duckdb_path=":memory:",
)
ACCOUNT = {
    "account_id": "acc1",
    "name": "Plaid Checking",
    "subtype": "checking",
    "balances": {"current": 1000, "iso_currency_code": "USD"},
}


def txn(tid, amount, name="Starbucks", pending=False, pending_id=None):
    return {
        "transaction_id": tid,
        "account_id": "acc1",
        "date": "2026-10-01",
        "amount": amount,
        "name": name,
        "merchant_name": name,
        "pending": pending,
        "pending_transaction_id": pending_id,
        "iso_currency_code": "USD",
        "personal_finance_category": {"primary": "FOOD_AND_DRINK", "detailed": "FOOD_AND_DRINK_COFFEE"},
    }


class FakePlaid:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def handler(self, request):
        body = json.loads(request.content)
        path = request.url.path
        self.calls.append((path, body))
        if path == "/item/public_token/exchange":
            return httpx.Response(200, json={"access_token": "access-secret", "item_id": "item1"})
        if path == "/accounts/get":
            return httpx.Response(200, json={"accounts": [ACCOUNT]})
        if path == "/transactions/sync":
            page = self.pages.pop(0)
            if isinstance(page, int):
                return httpx.Response(
                    page, json={"error_code": "ITEM_LOGIN_REQUIRED", "error_message": "login"}
                )
            return httpx.Response(200, json={"accounts": [ACCOUNT], "removed": [], "modified": [], **page})
        return httpx.Response(404)


def client_for(fake):
    return plaid.PlaidClient(SETTINGS, httpx.Client(transport=httpx.MockTransport(fake.handler)))


def connect_item(db, fake):
    c = client_for(fake)
    return c, plaid.exchange_public_token(db, c, "public", "Bank")


def test_full_sync_lifecycle(db):
    fake = FakePlaid(
        [
            {"added": [txn("p1", 5.25, pending=True)], "next_cursor": "c1", "has_more": True},
            {"added": [txn("t2", -100.0, name="Refund")], "next_cursor": "c2", "has_more": False},
        ]
    )
    c, item = connect_item(db, fake)
    assert plaid.sync_item(db, c, item) == {"added": 2, "modified": 0, "removed": 0}
    assert scalar(db, "SELECT cursor FROM plaid_items") == "c2"
    stored = scalar(db, "SELECT access_token_enc FROM plaid_items")
    assert "access-secret" not in stored

    p1 = rows(db, "SELECT * FROM reportable WHERE payee_raw = 'Starbucks'")[0]
    assert (float(p1["amount"]), p1["is_pending"], p1["category"], p1["category_group"]) == (
        -5.25,
        True,
        "Coffee",
        "Food And Drink",
    )

    tid = scalar(db, "SELECT id FROM transactions WHERE source_id = 'p1'")
    db.execute("UPDATE transactions SET merchant = 'My Coffee', user_edited = TRUE WHERE id = ?", [tid])

    fake.pages = [
        {
            "added": [txn("t1", 5.25, pending_id="p1")],
            "modified": [txn("t2", -90.0, name="Refund")],
            "removed": [{"transaction_id": "p1"}],
            "next_cursor": "c3",
            "has_more": False,
        }
    ]
    assert plaid.sync_item(db, c, item) == {"added": 1, "modified": 1, "removed": 1}
    posted = rows(db, "SELECT * FROM transactions WHERE source_id = 't1'")[0]
    assert (posted["merchant"], posted["is_pending"], posted["user_edited"]) == ("My Coffee", False, True)
    assert float(scalar(db, "SELECT amount FROM transactions WHERE source_id = 't2'")) == 90.0
    assert scalar(db, "SELECT COUNT(*) FROM transactions WHERE source_id = 'p1'") == 0
    assert fake.calls[-1][1]["cursor"] == "c2"


def test_failed_sync_marks_reconnect_and_keeps_data(db):
    fake = FakePlaid([{"added": [txn("t1", 5)], "next_cursor": "c1", "has_more": False}, 400])
    c, item = connect_item(db, fake)
    plaid.sync_item(db, c, item)
    with pytest.raises(plaid.PlaidError):
        plaid.sync_item(db, c, item)
    assert scalar(db, "SELECT status FROM plaid_items") == "reconnect"
    assert scalar(db, "SELECT cursor FROM plaid_items") == "c1"
    assert scalar(db, "SELECT COUNT(*) FROM transactions") == 1
    assert [r["status"] for r in rows(db, "SELECT status FROM sync_runs ORDER BY id")] == ["ok", "error"]


def test_mutation_during_pagination_restarts(db):
    fake = FakePlaid(
        [
            {"added": [txn("t1", 5)], "next_cursor": "c1", "has_more": True},
            400,
            {"added": [txn("t1", 5)], "next_cursor": "c9", "has_more": False},
        ]
    )
    original = fake.handler

    def handler(request):
        resp = original(request)
        if resp.status_code == 400:
            return httpx.Response(
                400, json={"error_code": "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", "error_message": "x"}
            )
        return resp

    fake.handler = handler
    c, item = connect_item(db, fake)
    assert plaid.sync_item(db, c, item)["added"] == 1
    assert scalar(db, "SELECT cursor FROM plaid_items") == "c9"
