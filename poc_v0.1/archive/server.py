"""
fastapi>=0.115
uvicorn>=0.30
python-dotenv>=1.0
requests>=2.32
ollama>=0.3.0
"""
"""
// Example with fetch; send only a prompt
const res = await fetch("http://localhost:8000/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "What did I spend by category last month?" })
});
const data = await res.json();
// data.reply -> final text
// data.tool_used/tool_args/tool_result -> telemetry if a tool was used

"""

# main.py
from __future__ import annotations
import os
import json
from typing import List, Dict, Optional, Any, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from lm import chat, extract_tool_call
from tools import run_tool
from prompts import SYSTEM_PROMPT

load_dotenv()

app = FastAPI(title="LM Chat API", version="0.2.0")

# --- CORS for local web frontends ---
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Types -----
class Message(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str

class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[Message]] = None
    months_back_default: int = 3  # used if tool args omit dates

class ChatResponse(BaseModel):
    reply: Optional[str]  # None if guard tripped
    tool_used: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    guard_tripped: Optional[bool] = False
    steps: int = 0  # how many tool steps executed

# ----- Helpers -----
def _default_dates(n_months: int) -> tuple[str, str]:
    import datetime as dt
    today = dt.date.today()
    first_of_this_month = today.replace(day=1)
    start_month = first_of_this_month
    for _ in range(n_months):
        start_month = (start_month - dt.timedelta(days=1)).replace(day=1)
    start = start_month
    end = today
    return start.isoformat(), end.isoformat()

def _prepare_messages(body: ChatRequest) -> List[Dict[str, str]]:
    msgs: List[Dict[str, str]] = []
    has_system = False
    if body.messages:
        for m in body.messages:
            msgs.append({"role": m.role, "content": m.content})
            if m.role == "system":
                has_system = True
    elif body.prompt:
        msgs = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": body.prompt},
        ]
        has_system = True
    else:
        raise HTTPException(400, "Provide either 'prompt' or 'messages'")
    if not has_system:
        msgs.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    return msgs

# Core loop: up to max_steps tool turns; returns (final_reply, last_tool, last_args, last_result, steps, guard_tripped)
def _chat_with_tools(messages: List[Dict[str, str]], months_back_default: int, max_steps: int = 2) -> Tuple[Optional[str], Optional[str], Optional[dict], Optional[dict], int, bool]:
    steps = 0
    last_tool = None
    last_args = None
    last_result = None

    while steps <= max_steps:
        # Model turn
        resp = chat(messages)  # {"role":"assistant","content": "..."}
        messages.append(resp)

        # Did the assistant ask for a tool?
        tool = extract_tool_call(resp.get("content", "") or "")
        if tool is None:
            # We have a final answer
            return resp.get("content", ""), last_tool, last_args, last_result, steps, False

        # Guard: if we already executed max_steps tools, stop here
        if steps == max_steps:
            # No final answer; guard trip
            return None, last_tool, last_args, last_result, steps, True

        # Run tool
        args = tool.setdefault("args", {})
        if not ("start_date" in args and "end_date" in args):
            s, e = _default_dates(months_back_default)
            args.setdefault("start_date", s)
            args.setdefault("end_date", e)

        last_tool = tool.get("tool")
        last_args = args
        result = run_tool(tool)
        last_result = result

        # Feed tool result back to model
        tool_result_msg = {
            "role": "user",
            "content": "Tool result for " + str(last_tool) +
                       ":\n<tool_result>" + json.dumps(result, ensure_ascii=False) + "</tool_result>"
        }
        messages.append(tool_result_msg)

        steps += 1

    # Should not reach here; treat as guard trip
    return None, last_tool, last_args, last_result, steps, True

# ----- Endpoints -----
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest):
    try:
        msgs = _prepare_messages(body)
        reply, tool_used, tool_args, tool_result, steps, guard = _chat_with_tools(
            messages=msgs,
            months_back_default=body.months_back_default,
            max_steps=2,
        )
        return ChatResponse(
            reply=reply,
            tool_used=tool_used,
            tool_args=tool_args,
            tool_result=tool_result,
            guard_tripped=guard,
            steps=steps,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Unhandled error: {e}")
