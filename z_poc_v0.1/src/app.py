# app.py
from __future__ import annotations
import re
import os
import json
import datetime as dt
from typing import List, Dict, Any, Tuple

import streamlit as st
from dotenv import load_dotenv

from lm import chat, extract_tool_call
from tools import run_tool
from prompts import SYSTEM_PROMPT

#=============================
#  SETTINGS
#=============================
load_dotenv()

st.set_page_config(page_title="LM PoC", page_icon="💬")
st.title("💬 Local Finance Chat (Ollama + Lunch Money)")


#=============================
#  UTILS
#============================
_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)  # ZWSP, ZWNJ, ZWJ, WJ, BOM

def _sanitize_reply(text: str) -> str:
    if not text:
        return text

    # remove zero-width & soft hyphens
    text = text.translate(_ZERO_WIDTH).replace("\u00ad", "")

    # collapse crazy whitespace runs (keep paragraph breaks)
    # 1) normalize CRLF
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # 2) if it looks like one-char-per-line, join lines
    lines = text.split("\n")
    if lines and (sum(1 for l in lines if len(l.strip()) <= 1) / max(1, len(lines))) > 0.6:
        text = "".join(lines)  # smash them back together
    else:
        # otherwise just tighten spaces while preserving blank lines
        text = re.sub(r"[ \t]+", " ", text)                      # collapse spaces
        text = re.sub(r"\n{3,}", "\n\n", text)                   # max 2 newlines
        # sometimes the model puts a newline between chars: "a\nr\ne"
        text = re.sub(r"(\S)\n(?=\S)", r"\1 ", text)             # turn into spaces

    return text.strip()


#=============================
#  MAIN
#=============================
# Sidebar settings
with st.sidebar:
    st.markdown("### Settings")
    default_months = int(os.getenv("LM_DEFAULT_MONTHS_BACK", "3"))
    months_back = st.number_input("Default months back", min_value=1, max_value=24, value=default_months)
    model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    st.write(f"**Model:** {model}")
    st.caption("Change via OLLAMA_MODEL env var.")

def _default_dates(n_months: int) -> tuple[str, str]:
    today = dt.date.today()
    first_of_this_month = today.replace(day=1)
    start_month = first_of_this_month
    for _ in range(n_months):
        start_month = (start_month - dt.timedelta(days=1)).replace(day=1)
    start = start_month
    end = today
    return start.isoformat(), end.isoformat()

# -----------------------------
# Tool loop (up to max_steps)
# -----------------------------
def _chat_with_tools(messages: List[Dict[str, str]], months_back_default: int, max_steps: int = 2
) -> Tuple[str | None, int, bool, Dict[str, Any] | None, Dict[str, Any] | None, Dict[str, Any] | None]:
    """
    Returns: (final_reply, steps, guard_tripped, last_tool_dict, last_tool_args, last_tool_result)
    """
    steps = 0
    last_tool = None
    last_args = None
    last_result = None

    while steps <= max_steps:
        # 1) Model turn
        resp = chat(messages)  # {"role":"assistant","content":"... maybe <tool_call>{...}</tool_call>"}
        messages.append(resp)

        # 2) Tool requested?
        tool = extract_tool_call(resp.get("content", "") or "")
        if tool is None:
            return resp.get("content", ""), steps, False, last_tool, last_args, last_result

        # Guard: stop if we’d exceed steps
        if steps == max_steps:
            return None, steps, True, last_tool, last_args, last_result

        # 3) Run tool
        args = tool.setdefault("args", {})
        if not ("start_date" in args and "end_date" in args):
            s, e = _default_dates(months_back_default)
            args.setdefault("start_date", s)
            args.setdefault("end_date", e)

        last_tool = tool
        last_args = args
        last_result = run_tool(tool)

        # 4) Feed tool result as a new user message so the model can summarize
        tool_result_msg = {
            "role": "user",
            "content": "Tool result for " + str(tool.get("tool")) +
                       ":\n<tool_result>" + json.dumps(last_result, ensure_ascii=False) + "</tool_result>"
        }
        messages.append(tool_result_msg)
        steps += 1

    # Shouldn’t reach here; treat as guard
    return None, steps, True, last_tool, last_args, last_result

# -----------------------------
# State + UI
# -----------------------------
if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]

# Render chat history (exclude system)
for m in st.session_state.messages:
    if m["role"] in ("user", "assistant"):
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

prompt = st.chat_input("Ask about your spending (e.g., 'Compare Jan–Mar this year vs last year').")

if prompt:
    # Immediately show the user message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Assistant placeholder + status
    assistant_bubble = st.chat_message("assistant")
    with assistant_bubble:
        reply_placeholder = st.empty()
        reply_placeholder.markdown("⏳ **Loading…**")
        status = st.status("🤔 Thinking…", expanded=False)

    try:
        # IMPORTANT: pass the whole message history into the tool loop.
        # The loop APPENDS the assistant's tool request BEFORE running tools,
        # then FEEDS tool result back to the model and asks again.
        status.update(label="🤖 Talking to the model…", state="running")
        final, steps, guard, last_tool, last_args, last_result = _chat_with_tools(
            messages=st.session_state.messages,
            months_back_default=months_back,
            max_steps=2,
        )

        if final is not None:
            with assistant_bubble:
                reply_placeholder.markdown(_sanitize_reply(final))
            status.update(label="✅ Done", state="complete")
        else:
            with assistant_bubble:
                reply_placeholder.markdown("⚠️ I needed more tool steps than allowed (max 2). Try narrowing the request.")
            status.update(label="⚠️ Max steps reached", state="error")

            # Optional debug
            with st.expander("Debug: last tool call & result"):
                st.code(json.dumps(last_tool or {}, indent=2), language="json")
                st.code(json.dumps(last_result or {}, indent=2), language="json")

    except Exception as e:
        with assistant_bubble:
            reply_placeholder.markdown("❌ **Error while generating a response.**")
            st.error(str(e))
        try:
            status.update(label="❌ Failed", state="error")
        except Exception:
            pass
