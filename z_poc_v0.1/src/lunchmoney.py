# lunchmoney.py
import os
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import requests

BASE = "https://dev.lunchmoney.app/v1"
TOKEN = os.getenv("LUNCHMONEY_TOKEN")

class LMError(Exception):
    pass

def _headers() -> Dict[str, str]:
    if not TOKEN:
        raise LMError("Missing LUNCHMONEY_TOKEN")
    return {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}

def _get(path: str, params: Optional[Dict[str, Any]] = None, timeout: int = 60) -> Any:
    r = requests.get(f"{BASE}{path}", headers=_headers(), params=params or {}, timeout=timeout)
    r.raise_for_status()
    return r.json()

# -----------------------------
# Core: Transactions (READ ONLY)
# -----------------------------

def get_transactions(
    start_date: str,
    end_date: str,
    status: Optional[str] = None,
    tag_ids: Optional[List[int]] = None,
    category_id: Optional[int] = None,
    plaid_account_id: Optional[int] = None,
    asset_id: Optional[int] = None,
    payee: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    is_pending: Optional[bool] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """Mirror 'Get all transactions' with common filters."""
    params: Dict[str, Any] = {
        "start_date": start_date,
        "end_date": end_date,
        "limit": limit,
    }
    if status is not None: params["status"] = status
    if tag_ids: params["tag_id"] = ",".join(str(t) for t in tag_ids)
    if category_id is not None: params["category_id"] = category_id
    if plaid_account_id is not None: params["plaid_account_id"] = plaid_account_id
    if asset_id is not None: params["asset_id"] = asset_id
    if payee: params["payee"] = payee
    if amount_min is not None: params["amount_min"] = amount_min
    if amount_max is not None: params["amount_max"] = amount_max
    if is_pending is not None: params["is_pending"] = str(bool(is_pending)).lower()

    data = _get("/transactions", params=params)
    return data.get("transactions", data)

def search_transactions(**kwargs) -> List[Dict[str, Any]]:
    """
    Convenience wrapper around get_transactions with the same args,
    but supports partial payee/range searches.
    """
    return get_transactions(**kwargs)

def get_single_transaction(txn_id: int) -> Dict[str, Any]:
    """Get detailed information for a single transaction."""
    data = _get(f"/transactions/{txn_id}")
    # API may return {transaction: {...}} or just object; normalize:
    return data.get("transaction", data)

def get_transaction_group(anchor_txn_id: int) -> Dict[str, Any]:
    """
    Best-effort: fetch the anchor transaction, then try to fetch its siblings.
    LM's grouping APIs vary by client; here we:
      1) fetch the anchor txn
      2) infer a small date window around the txn date
      3) fetch txns in that window and filter by possible grouping keys
    """
    anchor = get_single_transaction(anchor_txn_id)
    # Keys that might exist on LM objects (varies by import/source):
    group_id = anchor.get("group_id") or anchor.get("parent_id") or anchor.get("external_group_id")
    anchor_date = anchor.get("date")
    payee = anchor.get("payee")
    out = {"anchor": anchor, "siblings": []}

    if not anchor_date:
        return out

    try:
        d = datetime.fromisoformat(anchor_date).date()
    except Exception:
        d = date.fromisoformat(anchor_date)

    # window ±7 days around anchor
    start = (d - timedelta(days=7)).isoformat()
    end = (d + timedelta(days=7)).isoformat()
    window_txns = get_transactions(start, end, payee=payee, limit=500)

    # If group_id is present, prefer it; else match by (date, payee, amount sign)
    if group_id:
        sibs = [t for t in window_txns if (t.get("group_id") == group_id or t.get("parent_id") == group_id)]
    else:
        # fallback heuristic: same date+payee; keep all except the anchor id
        sibs = [t for t in window_txns if t.get("date") == anchor_date and t.get("payee") == payee and t.get("id") != anchor_txn_id]

    out["siblings"] = sibs
    return out

# -----------------------------
# Recurring & Budgets (READ)
# -----------------------------

def get_recurring_items(start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {}
    if start_date: params["start_date"] = start_date
    if end_date: params["end_date"] = end_date
    data = _get("/recurring_items", params=params)
    return data.get("recurring_items", data)

def get_budget_summary(month: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Budget summary for a month or date range.
    If 'month' provided (YYYY-MM), derive start/end.
    """
    params: Dict[str, Any] = {}
    if month:
        y, m = map(int, month.split("-"))
        start_date = date(y, m, 1).isoformat()
        # end of month
        if m == 12:
            end_date = date(y + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(y, m + 1, 1) - timedelta(days=1)
        end_date = end_date.isoformat()

    if start_date: params["start_date"] = start_date
    if end_date: params["end_date"] = end_date

    return _get("/budgets", params=params)

# -----------------------------
# Reference Data (READ)
# -----------------------------

def get_categories() -> List[Dict[str, Any]]:
    data = _get("/categories")
    return data.get("categories", data)

def get_category(category_id: int) -> Dict[str, Any]:
    data = _get(f"/categories/{category_id}")
    return data.get("category", data)

def get_tags() -> List[Dict[str, Any]]:
    data = _get("/tags")
    return data.get("tags", data)

def get_assets() -> List[Dict[str, Any]]:
    data = _get("/assets")
    return data.get("assets", data)

def get_plaid_accounts() -> List[Dict[str, Any]]:
    data = _get("/plaid_accounts")
    return data.get("plaid_accounts", data)
