import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_settings


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: Settings(duckdb_path=":memory:"))
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        yield c


def test_manual_flow(client):
    acct = client.post("/api/accounts", json={"name": "Cash"}).json()["id"]
    cat = client.post("/api/categories", json={"name": "Coffee", "group_name": "Food"}).json()["id"]
    assert client.post("/api/categories", json={"name": "Coffee"}).status_code == 409

    tid = client.post(
        "/api/transactions",
        json={
            "account_id": acct,
            "date": "2026-10-01",
            "amount": -4.5,
            "payee": "Blue Bottle",
        },
    ).json()["id"]
    assert client.post("/api/transactions/search", json={"uncategorized": True}).json()["total"] == 1

    client.patch(f"/api/transactions/{tid}", json={"category_id": cat, "tags": ["work"]})
    found = client.post("/api/transactions/search", json={"filters": {"search": "blue"}}).json()
    assert found["items"][0]["category"] == "Coffee"
    assert found["items"][0]["tags"] == ["work"]

    detail = client.get(f"/api/transactions/{tid}").json()
    assert detail["user_edited"] is True and detail["raw"]["payee"] == "Blue Bottle"

    q = {"dimensions": ["category_group"], "filters": {"start": "2026-10-01", "end": "2026-10-31"}}
    assert client.post("/api/analytics/query", json=q).json()["rows"][0] == {
        "d0": "Food",
        "value": 4.5,
        "n": 1,
    }

    csv_text = client.post("/api/transactions/export", json={}).text
    assert csv_text.splitlines()[1].split(",")[2:4] == ["Cash", "Blue Bottle"]


def test_saved_queries_round_trip(client):
    body = {"name": "Monthly food", "query": {"dimensions": ["month"], "metric": "avg"}}
    qid = client.post("/api/saved-queries", json=body).json()["id"]
    saved = client.get("/api/saved-queries").json()
    assert saved[0]["id"] == qid and saved[0]["query"]["metric"] == "avg"
    client.delete(f"/api/saved-queries/{qid}")
    assert client.get("/api/saved-queries").json() == []


def test_errors(client):
    assert client.post("/api/analytics/query", json={"metric": "cumulative"}).status_code == 422
    assert client.post("/api/ask", json={"question": "how much?"}).status_code == 503
    assert client.post("/api/plaid/link-token").status_code == 502
    assert client.get("/api/transactions/999").status_code == 404
