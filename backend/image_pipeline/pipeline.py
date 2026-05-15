"""Điều phối compile → recipe → validate → render → repair."""

from __future__ import annotations

import os

from sqlalchemy.orm import Session

from image_pipeline.hf_render import render_recipe_to_data_url
from prompt_builder import strengthen_negative_for_repair, build_diffusion_recipe
from retrieval.service import get_scope_for_project
from scene_graph.compiler import compile_scene_graph
from services import canon_queries as cq
from validators.continuity import validate_scene_against_db


def canon_engine_enabled() -> bool:
    return os.getenv("CANON_ENGINE_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")


def run_canon_image_pipeline(
    db: Session,
    project_id,
    intent: str,
    image_model_id: str,
    hf_api_key: str | None,
    *,
    max_repairs: int = 3,
) -> tuple[str, dict]:
    """
    Returns (data_url_or_error_message, debug_dict).
    """
    scope = get_scope_for_project(db, project_id)
    if not scope:
        return "", {"error": "no_canon_scope"}

    scene = compile_scene_graph(db, scope, intent, hf_api_key)
    rep = validate_scene_against_db(db, scene)
    meta: dict = {"violations": rep.violations, "scene_label": scene.scene_label, "repair_rounds": 0}

    if not rep.ok:
        return (
            "Continuity validation failed — khớp canon DB trước khi sinh ảnh: " + "; ".join(rep.violations),
            meta,
        )

    vb = cq.get_visual_bible(db, scope.id)
    recipe = build_diffusion_recipe(scene, vb, image_model_id=image_model_id)

    if not hf_api_key:
        return "Thiếu Hugging Face API key cho image pipeline.", meta

    last_err = ""
    current = recipe
    for attempt in range(max_repairs):
        if attempt > 0:
            current = strengthen_negative_for_repair(recipe, attempt)
            meta["repair_rounds"] = attempt
        try:
            out = render_recipe_to_data_url(current, hf_api_key)
            if out.startswith("data:image"):
                meta["recipe_positive_len"] = len(current.positive)
                return out, meta
        except Exception as e:
            last_err = str(e)
            continue

    return f"Canon image pipeline failed after repairs. Last error: {last_err}", meta
