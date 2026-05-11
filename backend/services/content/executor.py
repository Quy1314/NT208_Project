from services.content.registry import HandlerRegistry
from services.content.types import ExecutionPlan

_REGISTRY = HandlerRegistry()


def execute_prompt_to_text(plan: ExecutionPlan, prompt: str) -> str:
    """
    Execute normalized plan and return TTS-ready text.
    """
    subtype = str(plan.get("sub_type") or "speech").strip().lower()
    handler = _REGISTRY.get(subtype)
    return handler.render(plan=plan, prompt=prompt)

