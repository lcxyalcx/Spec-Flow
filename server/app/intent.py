from __future__ import annotations

import re
from enum import Enum


class TaskIntent(str, Enum):
    MATH = "math"
    CODE = "code"
    PLANNING = "planning"
    GENERAL = "general"


_MATH_PAT = re.compile(
    r"\b(integral|derivative|matrix|eigen|prove|theorem|equation|latex|\$\$?|"
    r"calculate|solve|sqrt|log_|lim_|∑|∫)\b",
    re.I,
)
_CODE_PAT = re.compile(
    r"\b(def |class |import |function |npm |async |await |=>|```|stack trace|"
    r"debug|refactor|typescript|python|rust|go\.mod)\b",
    re.I,
)
_PLAN_PAT = re.compile(
    r"\b(roadmap|milestone|okr|plan|steps|timeline|prioritize|"
    r"architecture|design doc|rfc)\b",
    re.I,
)


def classify_intent(user_text: str) -> TaskIntent:
    """Lightweight heuristic router; swap for a small classifier model in production."""
    t = user_text.strip()
    if not t:
        return TaskIntent.GENERAL
    if _MATH_PAT.search(t):
        return TaskIntent.MATH
    if _CODE_PAT.search(t):
        return TaskIntent.CODE
    if _PLAN_PAT.search(t):
        return TaskIntent.PLANNING
    return TaskIntent.GENERAL


def last_user_message(messages: list[dict[str, str]]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            c = m.get("content")
            return c if isinstance(c, str) else ""
    return ""
