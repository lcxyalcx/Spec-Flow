from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.config import Settings, get_settings
from app.intent import TaskIntent


@dataclass(frozen=True)
class ModelPair:
    target: str
    draft: str


def pair_for_intent(intent: TaskIntent, settings: Optional[Settings] = None) -> ModelPair:
    """Map task intent → (target, draft). Env defaults apply; override per intent via future config."""
    s = settings or get_settings()
    # Same physical model is valid for dev; production uses distinct SKUs.
    base_target = s.default_target_model
    base_draft = s.default_draft_model
    if intent == TaskIntent.MATH:
        return ModelPair(target=base_target, draft=base_draft)
    if intent == TaskIntent.CODE:
        return ModelPair(target=base_target, draft=base_draft)
    if intent == TaskIntent.PLANNING:
        return ModelPair(target=base_target, draft=base_draft)
    return ModelPair(target=base_target, draft=base_draft)
