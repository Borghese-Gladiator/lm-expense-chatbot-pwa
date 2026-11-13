"""Backend smoke test against a throwaway DB. Usage: python scripts/manual_check.py"""

from __future__ import annotations

import datetime
import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from scripts.seed_demo import main as seed

tmp = Path(tempfile.mkdtemp()) / "check.duckdb"
seed(str(tmp))

import app.main as main_module  # noqa: E402

main_module.get_settings = lambda: Settings(duckdb_path=str(tmp))  # type: ignore[assignment]

today = datetime.date.today()
first = today.replace(day=1)
last_month_end = first - datetime.timedelta(days=1)
last_month = {"start": last_month_end.replace(day=1).isoformat(), "end": last_month_end.isoformat()}


def show(title: str, data: object) -> None:
    print(f"\n== {title}")
    print(json.dumps(data, indent=2, default=str)[:1500])


with TestClient(main_module.create_app()) as c:
    show("health", c.get("/api/health").json())

    q = {"dimensions": ["category"], "filters": last_month, "compare": "previous_period"}
    res = c.post("/api/analytics/query", json=q).json()
    show("last month vs previous, by category", {"totals": res["totals"], "rows": res["rows"][:5]})
    assert abs(sum(r["diff"] for r in res["rows"]) - res["totals"]["diff"]) < 0.01

    top = res["rows"][0]["d0"]
    dd = c.post("/api/analytics/drilldown", json={"query": q, "values": {"category": top}}).json()
    assert abs(dd["total"] - res["rows"][0]["current"]) < 0.01
    show(f"drilldown {top}", {"total": dd["total"], "count": dd["count"]})

    trend = c.post("/api/analytics/query", json={"dimensions": ["month"], "metric": "cumulative"}).json()
    show("cumulative spending by month (first 3)", trend["rows"][:3])

    csv_text = "date,payee,amount,account\n2026-01-02,Cafe,-3.50,Imported Card\n"
    one = c.post("/api/import/csv", json={"csv_text": csv_text}).json()
    two = c.post("/api/import/csv", json={"csv_text": csv_text}).json()
    show("csv import twice", [one, two])
    assert one["added"] == 1 and two["added"] == 0

    print("\nAll manual checks passed.")
