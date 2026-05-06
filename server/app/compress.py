from __future__ import annotations

from copy import deepcopy


def compress_messages(messages: list[dict], max_messages: int = 30) -> list[dict]:
    """
    Deterministic context shaping: cap history depth, trim whitespace on string contents.
    Extension point: summarization service, tool-result stripping, etc.
    """
    msgs = deepcopy(messages)
    for m in msgs:
        c = m.get("content")
        if isinstance(c, str):
            m["content"] = c.strip()
    if len(msgs) <= max_messages:
        return msgs
    # Keep system (if any) + tail
    system = [m for m in msgs if m.get("role") == "system"]
    rest = [m for m in msgs if m.get("role") != "system"]
    tail = rest[-max_messages:]
    return system + tail
