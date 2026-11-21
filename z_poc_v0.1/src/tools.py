# tools.py
from __future__ import annotations
import datetime as dt
from dataclasses import dataclass
from typing import Any, Dict, Callable, List

from lunchmoney import (
    get_transactions,
    search_transactions,
    get_single_transaction,
    get_transaction_group,
    get_recurring_items,
    get_budget_summary,
    get_categories,
    get_category,
    get_tags,
    get_assets,
    get_plaid_accounts,
)

@dataclass
class Tool:
    name: str
    func: Callable[..., Any]
    schema: Dict[str, Any]

# -----------------------------
# Helpers (derived analytics)
# -----------------------------

def _sum_by_category_range(start_date: str, end_date: str, include_transfers: bool = True) -> List[Dict[str, Any]]:
    txns = get_transactions(start_date, end_date)
    out: Dict[str, float] = {}
    for t in txns:
        # Skip transfers if requested (LM often flags transfers via category or payee; heuristic only)
        if not include_transfers and (t.get("is_transfer") or (t.get("category_name") == "Transfers")):
            continue
        cat = t.get("category_name") or "Uncategorized"
        amt = float(t.get("amount") or 0)
        out[cat] = out.get(cat, 0.0) + amt
    # Sort by absolute spend desc
    items = sorted(out.items(), key=lambda kv: abs(kv[1]), reverse=True)
    return [{"category": k, "total": v} for k, v in items]

def _month_bounds(yyyymm: str) -> (str, str):
    y, m = map(int, yyyymm.split("-"))
    start = dt.date(y, m, 1)
    if m == 12:
        end = dt.date(y + 1, 1, 1) - dt.timedelta(days=1)
    else:
        end = dt.date(y, m + 1, 1) - dt.timedelta(days=1)
    return start.isoformat(), end.isoformat()

# -----------------------------
# Public tool executors
# -----------------------------

def exec_get_transactions(args: Dict[str, Any]):
    return {"transactions": get_transactions(**args)}

def exec_search_transactions(args: Dict[str, Any]):
    return {"transactions": search_transactions(**args)}

def exec_get_single_transaction(args: Dict[str, Any]):
    return {"transaction": get_single_transaction(int(args["id"]))}

def exec_get_transaction_group(args: Dict[str, Any]):
    return get_transaction_group(int(args["transaction_id"]))

def exec_get_recurring_items(args: Dict[str, Any]):
    return {"recurring_items": get_recurring_items(args.get("start_date"), args.get("end_date"))}

def exec_get_budget_summary(args: Dict[str, Any]):
    return get_budget_summary(month=args.get("month"), start_date=args.get("start_date"), end_date=args.get("end_date"))

def exec_get_categories(args: Dict[str, Any]):
    return {"categories": get_categories()}

def exec_get_category(args: Dict[str, Any]):
    return {"category": get_category(int(args["category_id"]))}

def exec_get_tags(args: Dict[str, Any]):
    return {"tags": get_tags()}

def exec_get_assets(args: Dict[str, Any]):
    return {"assets": get_assets()}

def exec_get_plaid_accounts(args: Dict[str, Any]):
    return {"plaid_accounts": get_plaid_accounts()}

def exec_sum_by_category(args: Dict[str, Any]):
    return {"by_category": _sum_by_category_range(args["start_date"], args["end_date"], bool(args.get("include_transfers", True)))}

def exec_month_over_month(args: Dict[str, Any]):
    start_month = args["start_month"]  # YYYY-MM
    months = int(args.get("months", 6))
    y, m = map(int, start_month.split("-"))
    anchor = dt.date(y, m, 1)
    out = []
    for i in range(months):
        mm = (anchor - dt.timedelta(days=1)).replace(day=1) if i == 0 else (out[-1]["_month_end"] + dt.timedelta(days=1)).replace(day=1)
        # Actually compute past months backward from start_month
    out = []
    for i in range(months):
        target = (anchor.replace(day=15) - dt.timedelta(days=30 * i)).replace(day=1)
        s = target.isoformat()
        e = (target + dt.timedelta(days=40)).replace(day=1) - dt.timedelta(days=1)
        txns = get_transactions(s, e.isoformat())
        total = sum(float(t.get("amount") or 0) for t in txns)
        out.append({"month": target.strftime("%Y-%m"), "total": total, "_month_end": e})
    out.reverse()
    for o in out:
        o.pop("_month_end", None)
    return {"mom": out}

def exec_top_merchants(args: Dict[str, Any]):
    n = int(args.get("n", 10))
    txns = get_transactions(args["start_date"], args["end_date"])
    agg: Dict[str, Dict[str, Any]] = {}
    for t in txns:
        payee = t.get("payee") or "(no payee)"
        amt = float(t.get("amount") or 0)
        a = agg.setdefault(payee, {"payee": payee, "total": 0.0, "tx_count": 0})
        a["total"] += amt
        a["tx_count"] += 1
    items = sorted(agg.values(), key=lambda x: abs(x["total"]), reverse=True)[:n]
    return {"top_merchants": items}

def exec_category_health(args: Dict[str, Any]):
    """
    Show budget vs actual for a month (optionally a single category_id).
    - month: "YYYY-MM" (required)
    - category_id?: int
    """
    month = args["month"]
    cat_id = args.get("category_id")
    start, end = _month_bounds(month)

    budget = get_budget_summary(month=month)
    txns = get_transactions(start, end)

    # Build spend per category
    spend: Dict[int, float] = {}
    names: Dict[int, str] = {}
    for t in txns:
        cid = t.get("category_id")
        if cid is None: 
            continue
        cid = int(cid)
        amt = float(t.get("amount") or 0)
        spend[cid] = spend.get(cid, 0.0) + amt
        if t.get("category_name"):
            names[cid] = t["category_name"]

    rows = []
    for row in budget.get("budgets", []) if isinstance(budget, dict) else []:
        cid = row.get("category_id")
        if cid is None: 
            continue
        if cat_id and int(cid) != int(cat_id):
            continue
        b_amount = float(row.get("budget_amount") or 0)
        s_amount = float(spend.get(int(cid), 0.0))
        rows.append({
            "category_id": int(cid),
            "category": row.get("category_name") or names.get(int(cid), "Unknown"),
            "budgeted": b_amount,
            "spent": s_amount,
            "remaining": b_amount - s_amount,
            "status": "OK" if s_amount <= b_amount else "Over",
        })

    # If user asked a specific category but it's not in budget entries, synthesize from txns
    if cat_id and not rows:
        cid = int(cat_id)
        s_amount = float(spend.get(cid, 0.0))
        rows.append({
            "category_id": cid,
            "category": names.get(cid, "Unknown"),
            "budgeted": 0.0,
            "spent": s_amount,
            "remaining": -s_amount,
            "status": "Over" if s_amount > 0 else "OK",
        })
    return {"category_health": rows}

def exec_monthly_cashflow(args: Dict[str, Any]):
    """
    Compute income / expenses / net per month over a span.
    Heuristic:
      - income = sum(amount > 0)
      - expenses = -sum(amount < 0)
    """
    start_month = args["start_month"]  # YYYY-MM
    months = int(args.get("months", 6))
    y, m = map(int, start_month.split("-"))
    anchor = dt.date(y, m, 1)
    out = []
    for i in range(months):
        target = (anchor.replace(day=15) - dt.timedelta(days=30 * i)).replace(day=1)
        s = target.isoformat()
        e = (target + dt.timedelta(days=40)).replace(day=1) - dt.timedelta(days=1)
        txns = get_transactions(s, e.isoformat())
        income = sum(float(t.get("amount") or 0) for t in txns if float(t.get("amount") or 0) > 0)
        expenses = -sum(float(t.get("amount") or 0) for t in txns if float(t.get("amount") or 0) < 0)
        out.append({"month": target.strftime("%Y-%m"), "income": income, "expenses": expenses, "net": income - expenses})
    out.reverse()
    return {"cashflow": out}

# ---- YoY helpers ----
def _sum_range(start_date: str, end_date: str, category_id=None, tag_ids=None, payee=None) -> float:
    txns = get_transactions(
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        tag_ids=tag_ids,
        payee=payee,
        limit=500,
    )
    return sum(float(t.get("amount") or 0) for t in txns)

def _shift_year(d: dt.date, years: int = 1) -> dt.date:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        # handle Feb 29 → Feb 28
        return d.replace(month=2, day=28, year=d.year - years)

def exec_compare_yoy(args: Dict[str, Any]):
    """
    Compare a month or date range against the same period last year.

    Args (one of):
      - month: "YYYY-MM"
      - start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD"
    Optional filters:
      - category_id: int
      - tag_ids: list[int]
      - payee: str

    Returns:
      {
        "current": {"start_date","end_date","total"},
        "prior": {"start_date","end_date","total"},
        "delta": total_current - total_prior,
        "pct_change": (delta / abs(total_prior)) if prior != 0 else None
      }
    """
    month = args.get("month")
    category_id = args.get("category_id")
    tag_ids = args.get("tag_ids")
    payee = args.get("payee")

    if month:
        y, m = map(int, month.split("-"))
        start = dt.date(y, m, 1)
        if m == 12:
            end = dt.date(y + 1, 1, 1) - dt.timedelta(days=1)
        else:
            end = dt.date(y, m + 1, 1) - dt.timedelta(days=1)
        prev_start = _shift_year(start, 1)
        prev_end = _shift_year(end, 1)
    else:
        if "start_date" not in args or "end_date" not in args:
            return {"error": "Provide either month=YYYY-MM or start_date & end_date"}
        start = dt.date.fromisoformat(args["start_date"])
        end = dt.date.fromisoformat(args["end_date"])
        prev_start = _shift_year(start, 1)
        prev_end = _shift_year(end, 1)

    cur_total = _sum_range(start.isoformat(), end.isoformat(), category_id, tag_ids, payee)
    prev_total = _sum_range(prev_start.isoformat(), prev_end.isoformat(), category_id, tag_ids, payee)

    delta = cur_total - prev_total
    pct = (delta / abs(prev_total)) if prev_total not in (0, 0.0) else None

    return {
        "current": {"start_date": start.isoformat(), "end_date": end.isoformat(), "total": cur_total},
        "prior": {"start_date": prev_start.isoformat(), "end_date": prev_end.isoformat(), "total": prev_total},
        "delta": delta,
        "pct_change": pct,
    }

# -----------------------------
# Registry
# -----------------------------

TOOLS: Dict[str, Tool] = {
    # Core reads
    "get_transactions": Tool("get_transactions", exec_get_transactions, {
        "tool": "get_transactions",
        "args": {
            "start_date": "YYYY-MM-DD",
            "end_date": "YYYY-MM-DD",
            "status": "string?",
            "tag_ids": "int[]?",
            "category_id": "int?",
            "plaid_account_id": "int?",
            "asset_id": "int?",
            "payee": "string?",
            "amount_min": "float?",
            "amount_max": "float?",
            "is_pending": "bool?",
            "limit": "int? (default 500)"
        }
    }),
    "search_transactions": Tool("search_transactions", exec_search_transactions, {
        "tool": "search_transactions",
        "args": "same as get_transactions"
    }),
    "get_single_transaction": Tool("get_single_transaction", exec_get_single_transaction, {
        "tool": "get_single_transaction",
        "args": {"id": "int"}
    }),
    "get_transaction_group": Tool("get_transaction_group", exec_get_transaction_group, {
        "tool": "get_transaction_group",
        "args": {"transaction_id": "int"}
    }),

    # NOTE: I don't use these features, so I've commented them out for now.
    ## Recurring & Budgets
    # "get_recurring_items": Tool("get_recurring_items", exec_get_recurring_items, {
    #     "tool": "get_recurring_items",
    #     "args": {"start_date": "YYYY-MM-DD?", "end_date": "YYYY-MM-DD?"}
    # }),
    # "get_budget_summary": Tool("get_budget_summary", exec_get_budget_summary, {
    #     "tool": "get_budget_summary",
    #     "args": {"month": "YYYY-MM?", "start_date": "YYYY-MM-DD?", "end_date": "YYYY-MM-DD?"}
    # }),

    # Reference data
    "get_categories": Tool("get_categories", exec_get_categories, {"tool": "get_categories", "args": {}}),
    "get_category": Tool("get_category", exec_get_category, {"tool": "get_category", "args": {"category_id": "int"}}),
    "get_tags": Tool("get_tags", exec_get_tags, {"tool": "get_tags", "args": {}}),
    # "get_assets": Tool("get_assets", exec_get_assets, {"tool": "get_assets", "args": {}}),
    "get_plaid_accounts": Tool("get_plaid_accounts", exec_get_plaid_accounts, {"tool": "get_plaid_accounts", "args": {}}),

    # Derived analytics (read-only)
    "sum_by_category": Tool("sum_by_category", exec_sum_by_category, {
        "tool": "sum_by_category",
        "args": {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "include_transfers": "bool? (default true)"}
    }),
    "month_over_month": Tool("month_over_month", exec_month_over_month, {
        "tool": "month_over_month",
        "args": {"start_month": "YYYY-MM", "months": "int (default 6)"}
    }),
    "top_merchants": Tool("top_merchants", exec_top_merchants, {
        "tool": "top_merchants",
        "args": {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "n": "int? (default 10)"}
    }),
    # "category_health": Tool("category_health", exec_category_health, {
    #     "tool": "category_health",
    #     "args": {"month": "YYYY-MM", "category_id": "int?"}
    # }),
    "compare_yoy": Tool(
        "compare_yoy",
        exec_compare_yoy,
        {
            "tool": "compare_yoy",
            "args": {
                # Use either month OR start_date+end_date
                "month": "YYYY-MM?",
                "start_date": "YYYY-MM-DD?",
                "end_date": "YYYY-MM-DD?",
                # Optional filters
                "category_id": "int?",
                "tag_ids": "int[]?",
                "payee": "string?",
            },
        },
    ),
}

def run_tool(tool_call: Dict[str, Any]) -> Dict[str, Any]:
    name = tool_call.get("tool")
    args = tool_call.get("args", {}) or {}
    if name not in TOOLS:
        return {"error": f"Unknown tool: {name}"}
    try:
        return TOOLS[name].func(args)
    except Exception as e:
        return {"error": str(e)}

