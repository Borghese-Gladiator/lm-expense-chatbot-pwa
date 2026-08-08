"""A scripted fake Anthropic async client for driving the analyst tool loop in tests.

It ignores the model's reasoning and instead replays a fixed script of assistant
turns (text + tool_use blocks). Each turn is a list of block dicts. The client stops
when the script is exhausted (final turn should contain only text).
"""

from __future__ import annotations

from typing import Any


class _Block:
    def __init__(self, data: dict[str, Any]) -> None:
        self.type = data["type"]
        if self.type == "text":
            self.text = data["text"]
        elif self.type == "tool_use":
            self.id = data["id"]
            self.name = data["name"]
            self.input = data["input"]


class _Response:
    def __init__(self, blocks: list[dict[str, Any]]) -> None:
        self.content = [_Block(b) for b in blocks]


class _Messages:
    def __init__(self, script: list[list[dict[str, Any]]]) -> None:
        self._script = script
        self._turn = 0
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _Response:
        self.calls.append(kwargs)
        if self._turn >= len(self._script):
            return _Response([{"type": "text", "text": "Done."}])
        blocks = _substitute_last(self._script[self._turn], _last_result_id(kwargs))
        self._turn += 1
        return _Response(blocks)


def _last_result_id(kwargs: dict[str, Any]) -> str | None:
    """Scan tool_result messages for the most recent result_id."""
    import json

    messages = kwargs.get("messages", [])
    found: str | None = None
    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                raw = block.get("content")
                try:
                    payload = json.loads(raw) if isinstance(raw, str) else raw
                except (ValueError, TypeError):
                    continue
                if isinstance(payload, dict) and payload.get("result_id"):
                    found = payload["result_id"]
    return found


def _substitute_last(
    blocks: list[dict[str, Any]], last_result_id: str | None
) -> list[dict[str, Any]]:
    if last_result_id is None:
        return blocks
    out: list[dict[str, Any]] = []
    for block in blocks:
        if block.get("type") == "tool_use":
            inp = dict(block.get("input", {}))
            if inp.get("result_id") == "__LAST__":
                inp["result_id"] = last_result_id
            out.append({**block, "input": inp})
        else:
            out.append(block)
    return out


class FakeAnthropic:
    def __init__(self, script: list[list[dict[str, Any]]]) -> None:
        self.messages = _Messages(script)


def query_then_chart_script(sql: str, view_spec: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Turn 1: query_finance. Turn 2: create_view. Turn 3: final insight text."""
    return [
        [
            {"type": "text", "text": "Let me query the data."},
            {"type": "tool_use", "id": "t1", "name": "query_finance", "input": {"sql": sql}},
        ],
        [
            {
                "type": "tool_use",
                "id": "t2",
                "name": "create_view",
                "input": {"result_id": "__LAST__", "view_spec": view_spec},
            }
        ],
        [{"type": "text", "text": "Here is your answer grounded in the data."}],
    ]
