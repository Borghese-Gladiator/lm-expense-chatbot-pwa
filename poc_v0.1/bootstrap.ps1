#=========================================
#   CHATGPT GENERATED SCAFFOLD SCRIPT
#=========================================

# Reliable scaffolder for: ollama + Lunch Money + Streamlit
# Usage:
#   .\init-ollama-lm-streamlit.ps1           # creates .\ollama-lunchmoney-streamlit-poc
#   .\init-ollama-lm-streamlit.ps1 -ProjectName "my-finance-poc"

[CmdletBinding()]
param(
  [string]$ProjectName = "ollama-lunchmoney-streamlit-poc"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve absolute project root under current directory
$ProjectRoot = Join-Path -Path (Get-Location) -ChildPath $ProjectName

function Write-File {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Content
  )
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }
  $utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBOM)
}

# Ensure root exists (idempotent)
[void][System.IO.Directory]::CreateDirectory($ProjectRoot)

# -----------------------------
# File contents
# -----------------------------

$app_py = @'
# app.py
from __future__ import annotations
import os
import json
import datetime as dt
from typing import List, Dict

import streamlit as st
from dotenv import load_dotenv

from lm import chat, extract_tool_call
from tools import run_tool
from prompts import SYSTEM_PROMPT

load_dotenv()

st.set_page_config(page_title="LM PoC", page_icon="💬")
st.title("💬 Local Finance Chat (Ollama + Lunch Money)")

with st.sidebar:
    st.markdown("### Settings")
    default_months = int(os.getenv("LM_DEFAULT_MONTHS_BACK", "3"))
    months_back = st.number_input("Default months back", min_value=1, max_value=24, value=default_months)
    model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    st.write(f"**Model:** {model}")
    st.caption("Change via OLLAMA_MODEL env var.")

if "messages" not in st.session_state:
    st.session_state.messages: List[Dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]

for m in st.session_state.messages:
    if m["role"] in ("user", "assistant"):
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

prompt = st.chat_input("Ask about your spending, e.g., 'What did I spend by category last month?' ✨")

def _default_dates(n_months: int) -> tuple[str, str]:
    today = dt.date.today()
    first_of_this_month = today.replace(day=1)
    start_month = first_of_this_month
    for _ in range(n_months):
        start_month = (start_month - dt.timedelta(days=1)).replace(day=1)
    start = start_month
    end = today
    return start.isoformat(), end.isoformat()

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    resp = chat(st.session_state.messages)
    tool = extract_tool_call(resp.get("content", ""))

    if tool is None:
        st.session_state.messages.append(resp)
        with st.chat_message("assistant"):
            st.markdown(resp["content"])
    else:
        args = tool.setdefault("args", {})
        if not ("start_date" in args and "end_date" in args):
            s, e = _default_dates(months_back)
            args.setdefault("start_date", s)
            args.setdefault("end_date", e)

        result = run_tool(tool)

        tool_result_msg = {
            "role": "user",
            "content": "Tool result for " + str(tool.get("tool")) + ":\n<tool_result>" + json.dumps(result, ensure_ascii=False) + "</tool_result>"
        }
        st.session_state.messages.append(tool_result_msg)

        final = chat(st.session_state.messages)
        st.session_state.messages.append(final)

        with st.chat_message("assistant"):
            st.markdown(final["content"])

        with st.expander("Debug: tool call & result"):
            st.code(json.dumps(tool, indent=2), language="json")
            st.code(json.dumps(result, indent=2), language="json")
'@

$lm_py = @'
# lm.py
import os
import json
import re
from typing import List, Dict, Any

try:
    import ollama as py_ollama
except Exception:
    py_ollama = None

import requests

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TEMP = float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))

Message = Dict[str, str]

def chat(messages: List[Message]) -> Dict[str, Any]:
    if py_ollama is not None:
        resp = py_ollama.chat(model=OLLAMA_MODEL, messages=messages, options={"temperature": TEMP})
        return resp.get("message", {"role": "assistant", "content": resp.get("response", "")})
    r = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={"model": OLLAMA_MODEL, "messages": messages, "options": {"temperature": TEMP}},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    msg = data.get("message") or {"role": "assistant", "content": data.get("response", "")}
    return msg

def extract_tool_call(text: str):
    m = re.search(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
'@

$lunchmoney_py = @'
# lunchmoney.py
import os
from typing import Any, Dict, List, Optional
import requests

BASE = "https://dev.lunchmoney.app/v1"
TOKEN = os.getenv("LUNCHMONEY_TOKEN")

class LMError(Exception):
    pass

def _headers() -> Dict[str, str]:
    if not TOKEN:
        raise LMError("Missing LUNCHMONEY_TOKEN")
    return {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}

def get_transactions(start_date: str, end_date: str, tag_id: Optional[int] = None, category_id: Optional[int] = None) -> List[Dict[str, Any]]:
    params = {"start_date": start_date, "end_date": end_date, "limit": 500}
    if tag_id is not None:
        params["tag_id"] = tag_id
    if category_id is not None:
        params["category_id"] = category_id
    r = requests.get(f"{BASE}/transactions", headers=_headers(), params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data.get("transactions", data)
'@

$tools_py = @'
# tools.py
from __future__ import annotations
import datetime as dt
from dataclasses import dataclass
from typing import Any, Dict, Callable
from lunchmoney import get_transactions

@dataclass
class Tool:
    name: str
    func: Callable[..., Any]
    schema: Dict[str, Any]

def exec_get_transactions(args: Dict[str, Any]):
    txns = get_transactions(args["start_date"], args["end_date"], args.get("tag_id"), args.get("category_id"))
    return {"transactions": txns, "count": len(txns)}

def exec_sum_by_category(args: Dict[str, Any]):
    txns = get_transactions(args["start_date"], args["end_date"])
    totals: Dict[str, float] = {}
    for t in txns:
        cat = (t.get("category_name") or "Uncategorized")
        amt = float(t.get("amount") or 0)
        totals[cat] = totals.get(cat, 0.0) + amt
    items = sorted(totals.items(), key=lambda kv: abs(kv[1]), reverse=True)
    return {"by_category": [{"category": k, "total": v} for k, v in items]}

def _add_months(d: dt.date, k: int) -> dt.date:
    y = d.year + (d.month - 1 + k) // 12
    m = (d.month - 1 + k) % 12 + 1
    return dt.date(y, m, 1)

def exec_month_over_month(args: Dict[str, Any]):
    start_month_str = args["start_month"]
    months = int(args.get("months", 6))
    start_month = dt.date.fromisoformat(start_month_str + "-01")
    out = []
    for i in range(months):
        m = _add_months(start_month, -i)
        month_start = m.replace(day=1)
        month_end = _add_months(month_start, 1) - dt.timedelta(days=1)
        txns = get_transactions(month_start.isoformat(), month_end.isoformat())
        total = sum(float(t.get("amount") or 0) for t in txns)
        out.append({"month": month_start.strftime("%Y-%m"), "total": total})
    out.reverse()
    return {"mom": out}

TOOLS: Dict[str, Tool] = {
    "get_transactions": Tool(
        name="get_transactions",
        func=exec_get_transactions,
        schema={
            "tool": "get_transactions",
            "args": {
                "start_date": "YYYY-MM-DD",
                "end_date": "YYYY-MM-DD",
                "tag_id": "int?",
                "category_id": "int?",
            },
        },
    ),
    "sum_by_category": Tool(
        name="sum_by_category",
        func=exec_sum_by_category,
        schema={
            "tool": "sum_by_category",
            "args": {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"},
        },
    ),
    "month_over_month": Tool(
        name="month_over_month",
        func=exec_month_over_month,
        schema={
            "tool": "month_over_month",
            "args": {"start_month": "YYYY-MM", "months": "int (default 6)"},
        },
    ),
}

def run_tool(tool_call: Dict[str, Any]) -> Dict[str, Any]:
    name = tool_call.get("tool")
    args = tool_call.get("args", {})
    if name not in TOOLS:
        return {"error": f"Unknown tool: {name}"}
    try:
        return TOOLS[name].func(args)
    except Exception as e:
        return {"error": str(e)}
'@

$prompts_py = @'
# prompts.py
SYSTEM_PROMPT = "
You are a personal finance chat assistant running locally. You can ask the host app to call TOOLS to fetch data from Lunch Money and compute aggregates.

When you NEED data, emit exactly one XML-style block with the tag tool_call containing a single JSON object. Example:
<tool_call>{\"tool\": \"get_transactions\", \"args\": {\"start_date\": \"2025-07-01\", \"end_date\": \"2025-07-31\"}}</tool_call>

Available tools:
- get_transactions(start_date: YYYY-MM-DD, end_date: YYYY-MM-DD, tag_id?: int, category_id?: int)
- sum_by_category(start_date, end_date)
- month_over_month(start_month: YYYY-MM, months: int)

Rules:
- If the user asks anything requiring transactions or totals, request a tool.
- Be concise and show numbers with currency symbols.
- After the app returns tool results (provided back to you as a tool_result block), continue the conversation using that data. Do not repeat the tool JSON back to the user.
- If dates are missing, assume the last N months (provided by host) and state your assumption.
"
'@

$requirements_txt = @'
streamlit>=1.36
python-dotenv>=1.0
requests>=2.32
ollama>=0.3.0
'@

$env_sample = @'
# Lunch Money API https://lunchmoney.dev/
LUNCHMONEY_TOKEN=lm_xxx_your_personal_access_token

# Optional: default date window for queries if user doesn't specify
LM_DEFAULT_MONTHS_BACK=3

# Ollama model to use
OLLAMA_MODEL=llama3.1:8b

# Temperature etc.
OLLAMA_TEMPERATURE=0.2
'@

$readme_md = @'
Local Finance Chat (Ollama + Lunch Money + Streamlit)

Minimal PoC that lets a local LLM call tools to fetch and summarize your Lunch Money transactions, all inside a Streamlit chat UI.

Prereqs
- Ollama installed and running
- Python 3.10+
- Lunch Money personal access token

Setup
1) ollama pull llama3.1:8b
2) python -m venv .venv
3) Windows PowerShell: . .\.venv\Scripts\Activate.ps1
   macOS/Linux: . .venv/bin/activate
4) pip install -r requirements.txt
5) copy .env.sample .env  (then add LUNCHMONEY_TOKEN)
6) streamlit run app.py

How it works
- The assistant emits a tool_call XML block when it needs data, for example:
  <tool_call>{"tool":"sum_by_category","args":{"start_date":"2025-08-01","end_date":"2025-08-31"}}</tool_call>
- The app intercepts that JSON, runs the corresponding Python function, then feeds the JSON result back to the model.

Extending
- Add tools in tools.py and describe them in prompts.py so the model knows they exist.
- Swap models via the OLLAMA_MODEL environment variable.
- Add charts using Streamlit components.
'@

$gitignore = @'
.venv/
.env
__pycache__/
.streamlit/
'@

# -----------------------------
# Write files to $ProjectRoot
# -----------------------------
Write-File -Path (Join-Path $ProjectRoot "app.py") -Content $app_py
Write-File -Path (Join-Path $ProjectRoot "lm.py") -Content $lm_py
Write-File -Path (Join-Path $ProjectRoot "lunchmoney.py") -Content $lunchmoney_py
Write-File -Path (Join-Path $ProjectRoot "tools.py") -Content $tools_py
Write-File -Path (Join-Path $ProjectRoot "prompts.py") -Content $prompts_py
Write-File -Path (Join-Path $ProjectRoot "requirements.txt") -Content $requirements_txt
Write-File -Path (Join-Path $ProjectRoot ".env.sample") -Content $env_sample
Write-File -Path (Join-Path $ProjectRoot "README.md") -Content $readme_md
Write-File -Path (Join-Path $ProjectRoot ".gitignore") -Content $gitignore

"✅ Project scaffold created at: $ProjectRoot
Next:
  1) ollama pull llama3.1:8b
  2) python -m venv .venv; . .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
  3) copy .env.sample .env  (set LUNCHMONEY_TOKEN)
  4) streamlit run app.py"
