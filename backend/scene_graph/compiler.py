"""Compile deterministic SceneGraph from canon DB + intent hints."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from huggingface_hub import InferenceClient
from sqlalchemy.orm import Session

from lore.db_models import CanonScope
from scene_graph.schemas import (
    Environment,
    IntentHints,
    LightingCamera,
    OutfitRef,
    SceneCharacter,
    SceneCreature,
    SceneGraph,
)
from services import canon_queries as cq


def extract_intent_hints_heuristic(intent: str, db: Session, scope_id: uuid.UUID) -> IntentHints:
    text = (intent or "").strip()
    low = text.lower()

    char_slug = None
    for ch in cq.list_characters(db, scope_id):
        if ch.slug in low or ch.display_name.lower() in low:
            char_slug = ch.slug
            break

    loc_slug = None
    for loc in cq.list_locations(db, scope_id):  # need to add list_locations
        if loc.slug.replace("_", " ") in low or loc.display_name.lower() in low:
            loc_slug = loc.slug
            break

    # landmarks / fan vocabulary
    if loc_slug is None:
        if "indigo" in low:
            loc_slug = "indigo_plateau"

    tod = None
    for kw in ("dawn", "sunrise", "morning", "noon", "dusk", "sunset", "night"):
        if kw in low:
            tod = kw
            break

    return IntentHints(character_slug=char_slug, location_slug=loc_slug, time_of_day=tod, extra_prompt=text)


def extract_intent_hints_llm(intent: str, hf_api_key: str | None) -> IntentHints | None:
    key = (hf_api_key or os.getenv("hf_key_read") or "").strip()
    if not key:
        return None
    model = os.getenv("CANON_INTENT_MODEL", "Qwen/Qwen2.5-7B-Instruct").strip()
    client = InferenceClient(token=key)
    schema = '{"character_slug": string|null, "location_slug": string|null, "time_of_day": string|null}'
    prompt = (
        "Extract JSON only for fields: character_slug (slug lower_snake), location_slug, time_of_day.\n"
        f"User intent:\n{intent}\nJSON:"
    )
    try:
        resp = client.chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": "Return ONLY compact JSON matching this shape: " + schema},
                {"role": "user", "content": prompt},
            ],
            max_tokens=200,
            temperature=0.1,
        )
        raw = str(resp.choices[0].message.content).strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)
        return IntentHints(
            character_slug=data.get("character_slug"),
            location_slug=data.get("location_slug"),
            time_of_day=data.get("time_of_day"),
            extra_prompt=intent,
        )
    except Exception:
        return None


def compile_scene_graph(
    db: Session,
    scope: CanonScope,
    intent: str,
    hf_api_key: str | None,
) -> SceneGraph:
    hints = extract_intent_hints_heuristic(intent, db, scope.id)
    if hints.character_slug is None and hints.location_slug is None:
        llm_h = extract_intent_hints_llm(intent, hf_api_key)
        if llm_h:
            hints = llm_h

    focus_slug = hints.character_slug
    if not focus_slug:
        chars = cq.list_characters(db, scope.id)
        if len(chars) == 1:
            focus_slug = chars[0].slug
        elif chars:
            focus_slug = chars[0].slug

    if not focus_slug:
        raise ValueError("No character slug resolved; register at least one canon character.")

    ch = cq.get_character_by_slug(db, scope.id, focus_slug)
    if not ch:
        raise ValueError(f"Unknown character slug: {focus_slug}")

    vv = cq.ensure_default_visual_variant(db, ch.id)
    vv_label = vv.label
    outfit_summary = vv.outfit_summary
    variant_id = vv.id
    marks = vv.face_marks_json or []
    appearance_notes = json.dumps(marks) if marks else outfit_summary[:200]

    party_rows = cq.get_party_rows(db, ch.id)
    creatures: list[SceneCreature] = []
    for pr in party_rows:
        cr = cq.get_creature(db, pr.creature_instance_id)
        if cr:
            creatures.append(
                SceneCreature(
                    instance_id=cr.id,
                    species_key=cr.species_key,
                    stage_key=cr.stage_key,
                    nickname=cr.nickname,
                    pose_hint="standing ready",
                )
            )

    loc_slug = hints.location_slug or "unspecified"
    loc = cq.get_location_by_slug(db, scope.id, loc_slug) if loc_slug != "unspecified" else None
    env = Environment(
        location_slug=loc_slug,
        display_name=loc.display_name if loc else None,
        time_of_day=hints.time_of_day or "golden hour",
        landmark_hints=[loc.display_name] if loc else [],
    )

    scene = SceneGraph(
        scope_id=scope.id,
        scene_label="generated_scene",
        characters=[
            SceneCharacter(
                character_id=ch.id,
                slug=ch.slug,
                outfit=OutfitRef(variant_id=variant_id, label=vv_label),
                emotion="determined",
                action=hints.extra_prompt,
                appearance_notes=appearance_notes,
            )
        ],
        creatures=creatures,
        environment=env,
        lc=LightingCamera(
            lighting="cinematic rim light, volumetric haze",
            camera="wide establishing shot, rule of thirds",
            emotional_tone="epic",
        ),
    )
    return scene
