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