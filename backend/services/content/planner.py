from typing import Any
from services.content.types import ExecutionPlan


def _fallback_sub_type(prompt: str) -> str:
    prompt_lower = prompt.lower()
    if any(word in prompt_lower for word in ["haha", "cười", "sfx", "sound effect", "hiệu ứng"]):
        return "sfx"
    if any(word in prompt_lower for word in ["hát", "song", "lyrics", "bài hát", "ca khúc"]):
        return "song"
    return "speech"


def _fallback_plan(prompt: str, language: str) -> ExecutionPlan:
    return {
        "intent": prompt,
        "task_type": "audio",
        "sub_type": _fallback_sub_type(prompt),
        "language": "vi" if language == "vietnamese" else "en",
        "constraints": {
            "format": "preserve-user-format",
            "style": "normal",
            "duration": "auto",
        },
        "original_prompt": prompt,
        "must_follow_user_format": True,
        "must_not_add_explanations": True,
    }


def _normalize_constraints(raw: Any) -> dict[str, Any]:
    constraints = raw if isinstance(raw, dict) else {}
    constraints.setdefault("format", "preserve-user-format")
    constraints.setdefault("style", "normal")
    constraints.setdefault("duration", "auto")
    return constraints


def plan_audio_prompt(prompt: str, language: str = "vietnamese") -> ExecutionPlan:
    """
    Analyze prompt and return a normalized audio execution plan.
    """
    # Planner is intentionally deterministic here to avoid extra model dependency.
    raw_plan = _fallback_plan(prompt, language)

    plan: ExecutionPlan = {
        "intent": str(raw_plan.get("intent") or prompt),
        "task_type": "audio",
        "sub_type": str(raw_plan.get("sub_type") or "speech"),
        "language": str(raw_plan.get("language") or ("vi" if language == "vietnamese" else "en")),
        "constraints": _normalize_constraints(raw_plan.get("constraints")),
        "original_prompt": prompt,
        "must_follow_user_format": True,
        "must_not_add_explanations": True,
    }

    if plan["sub_type"] not in {"speech", "song", "sfx"}:
        plan["sub_type"] = _fallback_sub_type(prompt)
    return plan

