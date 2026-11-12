from __future__ import annotations

import contextlib
import csv
import datetime
import io
import json
import pathlib
import threading
from collections.abc import AsyncIterator, Iterator
from typing import Any, Literal

import anthropic
import duckdb
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import plaid
from app.analytics import AnalyticsQuery, Drilldown, Filters, drilldown, run_query, where_clause
from app.ask import AskResult, ask
from app.config import Settings, get_settings
from app.csv_import import CsvImportRequest, CsvImportResult, import_csv
from app.db import connect, rows, scalar

DIST = pathlib.Path(__file__).resolve().parent.parent / "frontend" / "dist"
_lock = threading.Lock()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings
    app.state.db = connect(settings.duckdb_path)
    app.state.plaid = plaid.PlaidClient(settings)
    yield
    app.state.db.close()


def get_db(request: Request) -> Iterator[duckdb.DuckDBPyConnection]:
    # ponytail: one connection + global lock; per-request cursors if concurrency matters
    with _lock:
        yield request.app.state.db


def get_cfg(request: Request) -> Settings:
    return request.app.state.settings


api = APIRouter(prefix="/api")


def _plain(r: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in r.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            v = v.isoformat()
        elif hasattr(v, "is_finite"):
            v = float(v)
        out[k] = v
    return out


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@api.get("/health")
def health(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return {
        "status": "ok",
        "transactions": scalar(db, "SELECT COUNT(*) FROM transactions"),
        "last_sync": _plain(
            {"at": scalar(db, "SELECT MAX(finished_at) FROM sync_runs WHERE status != 'error'")}
        )["at"],
    }


@api.get("/meta")
def meta(db: duckdb.DuckDBPyConnection = Depends(get_db), cfg: Settings = Depends(get_cfg)) -> dict[str, Any]:
    return {
        "currency": cfg.currency,
        "plaid_configured": bool(cfg.plaid_client_id),
        "plaid_env": cfg.plaid_env,
        "ask_configured": bool(cfg.anthropic_api_key.get_secret_value()),
        "categories": [
            _plain(r) for r in rows(db, "SELECT * FROM categories ORDER BY group_name NULLS LAST, name")
        ],
        "accounts": [
            _plain(r)
            for r in rows(
                db,
                """SELECT a.*, (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS txn_count
                   FROM accounts a ORDER BY a.name""",
            )
        ],
        "tags": [r["t"] for r in rows(db, "SELECT DISTINCT unnest(tags) AS t FROM transactions ORDER BY t")],
        "groups": [
            r["g"] for r in rows(db, "SELECT DISTINCT category_group AS g FROM reportable ORDER BY g")
        ],
        "date_bounds": _plain(rows(db, "SELECT MIN(date) AS start, MAX(date) AS end FROM transactions")[0]),
    }


# ---------- analytics ----------


@api.post("/analytics/query")
def analytics_query(q: AnalyticsQuery, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    return run_query(db, q)


@api.post("/analytics/drilldown")
def analytics_drilldown(req: Drilldown, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    try:
        return drilldown(db, req)
    except ValueError as exc:
        raise _bad(exc) from None


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@api.post("/ask", response_model=AskResult)
def post_ask(
    body: AskRequest,
    db: duckdb.DuckDBPyConnection = Depends(get_db),
    cfg: Settings = Depends(get_cfg),
) -> AskResult:
    if not cfg.anthropic_api_key.get_secret_value():
        raise HTTPException(503, "set ANTHROPIC_API_KEY to use Ask")
    try:
        return ask(db, cfg, body.question)
    except (ValueError, anthropic.APIError) as exc:
        raise HTTPException(502, f"Ask failed: {exc.__class__.__name__}") from None


# ---------- saved queries ----------


class SavedQueryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: AnalyticsQuery


@api.get("/saved-queries")
def list_saved(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict]:
    out = []
    for r in rows(db, "SELECT * FROM saved_queries ORDER BY updated_at DESC"):
        r = _plain(r)
        r["query"] = json.loads(r["query"])
        out.append(r)
    return out


@api.post("/saved-queries")
def create_saved(body: SavedQueryIn, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    new_id = scalar(
        db,
        "INSERT INTO saved_queries (name, query) VALUES (?, ?) RETURNING id",
        [body.name, body.query.model_dump_json()],
    )
    return {"id": new_id}


@api.put("/saved-queries/{qid}")
def update_saved(qid: int, body: SavedQueryIn, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    db.execute(
        "UPDATE saved_queries SET name = ?, query = ?, updated_at = current_timestamp WHERE id = ?",
        [body.name, body.query.model_dump_json(), qid],
    )
    return {"id": qid}


@api.delete("/saved-queries/{qid}")
def delete_saved(qid: int, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    db.execute("DELETE FROM saved_queries WHERE id = ?", [qid])
    return {"ok": True}


# ---------- transactions ----------


class TxnSearch(BaseModel):
    filters: Filters = Filters(include_pending=True, include_excluded_categories=True)
    uncategorized: bool = False
    unreviewed: bool = False
    sort: Literal["date", "amount", "merchant", "category", "account"] = "date"
    desc: bool = True
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)


def _txn_where(body: TxnSearch) -> tuple[str, list[Any]]:
    where, params = where_clause(body.filters, None)
    if body.uncategorized:
        where += " AND category_id IS NULL"
    if body.unreviewed:
        where += " AND NOT reviewed"
    return where, params


@api.post("/transactions/search")
def search_txns(body: TxnSearch, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    where, params = _txn_where(body)
    order = f"{body.sort} {'DESC' if body.desc else 'ASC'}, id DESC"
    items = rows(
        db,
        f"SELECT * FROM reportable WHERE {where} ORDER BY {order} LIMIT {body.limit} OFFSET {body.offset}",
        params,
    )
    total = rows(db, f"SELECT COUNT(*) AS n, SUM(amount) AS s FROM reportable WHERE {where}", params)[0]
    return {
        "items": [_plain(r) for r in items],
        "total": total["n"],
        "sum": float(total["s"] or 0),
    }


@api.get("/transactions/{tid}")
def get_txn(tid: int, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    found = rows(
        db,
        """SELECT t.*, a.name AS account, c.name AS category FROM transactions t
           LEFT JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.id = ?""",
        [tid],
    )
    if not found:
        raise HTTPException(404, "transaction not found")
    r = _plain(found[0])
    r["raw"] = json.loads(r["raw"]) if r["raw"] else None
    r["children"] = [_plain(c) for c in rows(db, "SELECT * FROM transactions WHERE parent_id = ?", [tid])]
    return r


TxnType = Literal["income", "expense", "transfer", "adjustment"]


class TxnIn(BaseModel):
    account_id: int
    date: datetime.date
    amount: float
    payee: str = Field(min_length=1)
    category_id: int | None = None
    tags: list[str] = []
    notes: str | None = None
    type: TxnType | None = None


@api.post("/transactions")
def create_txn(
    body: TxnIn, db: duckdb.DuckDBPyConnection = Depends(get_db), cfg: Settings = Depends(get_cfg)
) -> dict:
    new_id = scalar(
        db,
        """INSERT INTO transactions (source, account_id, date, amount, currency, payee_raw, merchant,
               category_id, tags, notes, type, reviewed, user_edited, raw)
           VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, ?) RETURNING id""",
        [
            body.account_id,
            body.date,
            body.amount,
            cfg.currency,
            body.payee,
            body.payee,
            body.category_id,
            body.tags,
            body.notes,
            body.type,
            body.model_dump_json(),
        ],
    )
    return {"id": new_id}


class TxnPatch(BaseModel):
    merchant: str | None = None
    category_id: int | None = None
    tags: list[str] | None = None
    notes: str | None = None
    type: TxnType | None = None
    reviewed: bool | None = None
    clear_category: bool = False
    clear_type: bool = False


def _patch(db: duckdb.DuckDBPyConnection, ids: list[int], body: TxnPatch) -> None:
    fields = body.model_dump(exclude_none=True, exclude={"clear_category", "clear_type"})
    sets = [f"{k} = ?" for k in fields]
    params: list[Any] = list(fields.values())
    if body.clear_category:
        sets.append("category_id = NULL")
    if body.clear_type:
        sets.append("type = NULL")
    if not sets:
        return
    sets += ["user_edited = TRUE", "updated_at = current_timestamp"]
    db.execute(
        f"UPDATE transactions SET {', '.join(sets)} WHERE id IN ({', '.join('?' * len(ids))})",
        params + ids,
    )


@api.patch("/transactions/{tid}")
def patch_txn(tid: int, body: TxnPatch, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    _patch(db, [tid], body)
    return {"ok": True}


class BulkPatch(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=5000)
    patch: TxnPatch


@api.post("/transactions/bulk")
def bulk_patch(body: BulkPatch, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    _patch(db, body.ids, body.patch)
    return {"updated": len(body.ids)}


@api.delete("/transactions/{tid}")
def delete_txn(tid: int, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    source = scalar(db, "SELECT source FROM transactions WHERE id = ?", [tid])
    if source == "plaid":
        raise HTTPException(409, "bank transactions come back on sync; set type to adjustment instead")
    db.execute("DELETE FROM transactions WHERE id = ?", [tid])
    return {"ok": True}


@api.post("/transactions/export")
def export_txns(body: TxnSearch, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> StreamingResponse:
    where, params = _txn_where(body)
    data = rows(
        db,
        f"""SELECT id, date, account, merchant, payee_raw, category, category_group, txn_type AS type,
                   amount, currency, array_to_string(tags, ',') AS tags, notes, is_pending, source
            FROM reportable WHERE {where} ORDER BY date DESC""",
        params,
    )
    buf = io.StringIO()
    if data:
        w = csv.DictWriter(buf, fieldnames=list(data[0]))
        w.writeheader()
        w.writerows(data)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


# ---------- accounts, categories, import ----------


class AccountIn(BaseModel):
    name: str = Field(min_length=1)
    type: str = "checking"
    institution: str | None = None
    currency: str = "USD"
    balance: float | None = None


@api.post("/accounts")
def create_account(body: AccountIn, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    new_id = scalar(
        db,
        """INSERT INTO accounts (name, type, institution, currency, balance, balance_at)
           VALUES (?, ?, ?, ?, ?, current_timestamp) RETURNING id""",
        [body.name, body.type, body.institution, body.currency.upper(), body.balance],
    )
    return {"id": new_id}


class AccountPatch(BaseModel):
    name: str | None = None
    archived: bool | None = None


@api.patch("/accounts/{aid}")
def patch_account(aid: int, body: AccountPatch, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    fields = body.model_dump(exclude_none=True)
    if fields:
        db.execute(
            f"UPDATE accounts SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
            [*fields.values(), aid],
        )
    return {"ok": True}


@api.delete("/accounts/{aid}")
def delete_account(aid: int, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    db.execute("DELETE FROM transactions WHERE account_id = ?", [aid])
    db.execute("DELETE FROM accounts WHERE id = ?", [aid])
    return {"ok": True}


class CategoryIn(BaseModel):
    name: str = Field(min_length=1)
    group_name: str | None = None
    kind: Literal["expense", "income", "transfer"] = "expense"
    exclude_from_totals: bool = False
    archived: bool = False


@api.post("/categories")
def create_category(body: CategoryIn, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    try:
        new_id = scalar(
            db,
            """INSERT INTO categories (name, group_name, kind, exclude_from_totals, archived)
               VALUES (?, ?, ?, ?, ?) RETURNING id""",
            [body.name, body.group_name, body.kind, body.exclude_from_totals, body.archived],
        )
    except duckdb.ConstraintException:
        raise HTTPException(409, "a category with that name exists") from None
    return {"id": new_id}


@api.put("/categories/{cid}")
def update_category(cid: int, body: CategoryIn, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    db.execute(
        """UPDATE categories SET name = ?, group_name = ?, kind = ?, exclude_from_totals = ?,
             archived = ? WHERE id = ?""",
        [body.name, body.group_name, body.kind, body.exclude_from_totals, body.archived, cid],
    )
    return {"ok": True}


@api.post("/import/csv", response_model=CsvImportResult)
def post_import(
    body: CsvImportRequest,
    db: duckdb.DuckDBPyConnection = Depends(get_db),
    cfg: Settings = Depends(get_cfg),
) -> CsvImportResult:
    try:
        return import_csv(db, body, cfg.currency)
    except ValueError as exc:
        raise _bad(exc) from None


@api.get("/sync-runs")
def sync_runs(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict]:
    return [_plain(r) for r in rows(db, "SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50")]


@api.post("/data/delete-all")
def delete_all(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    for table in ["transactions", "accounts", "categories", "plaid_items", "sync_runs", "saved_queries"]:
        db.execute(f"DELETE FROM {table}")
    return {"ok": True}


# ---------- plaid ----------


@api.get("/plaid/items")
def plaid_items(db: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict]:
    return [
        _plain(r)
        for r in rows(db, "SELECT id, item_id, institution, status, error, created_at FROM plaid_items")
    ]


@api.post("/plaid/link-token")
def plaid_link_token(request: Request) -> dict:
    try:
        return {"link_token": plaid.create_link_token(request.app.state.plaid)}
    except plaid.PlaidError as exc:
        raise HTTPException(502, str(exc)) from None


class PublicTokenIn(BaseModel):
    public_token: str
    institution: str | None = None


@api.post("/plaid/exchange")
def plaid_exchange(
    body: PublicTokenIn, request: Request, db: duckdb.DuckDBPyConnection = Depends(get_db)
) -> dict:
    client = request.app.state.plaid
    try:
        item_pk = plaid.exchange_public_token(db, client, body.public_token, body.institution)
        result = plaid.sync_item(db, client, item_pk)
    except (plaid.PlaidError, RuntimeError) as exc:
        raise HTTPException(502, str(exc)) from None
    return {"item": item_pk, **result}


@api.post("/plaid/items/{item_pk}/sync")
def plaid_sync(item_pk: int, request: Request, db: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    try:
        return plaid.sync_item(db, request.app.state.plaid, item_pk)
    except (plaid.PlaidError, RuntimeError) as exc:
        raise HTTPException(502, str(exc)) from None


def create_app() -> FastAPI:
    app = FastAPI(title="Spend Lens", lifespan=lifespan)
    app.include_router(api)
    if DIST.exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            return FileResponse(DIST / "index.html")

    return app


app = create_app()
