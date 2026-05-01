from typing import Any, TypedDict


class ExecutionPlan(TypedDict, total=False):
    intent: str
    task_type: str
    sub_type: str
    language: str
    constraints: dict[str, Any]
    original_prompt: str
    must_follow_user_format: bool
    must_not_add_explanations: bool

