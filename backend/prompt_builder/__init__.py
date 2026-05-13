"""Build DiffusionRecipe from SceneGraph + VisualBible (no hand-written raw prompts)."""

from __future__ import annotations

import hashlib
import os

from lore.db_models import VisualBible
from scene_graph.schemas import DiffusionRecipe, SceneGraph


def _stable_seed(scope_id_str: str, scene_label: str) -> int:
    h = hashlib.sha256(f"{scope_id_str}:{scene_label}".encode()).hexdigest()
    return int(h[:8], 16) % (2**31)


def build_diffusion_recipe(
    scene: SceneGraph,
    visual_bible: VisualBible | None,
    *,
    image_model_id: str,
) -> DiffusionRecipe:
    vb_neg = (visual_bible.negative_bank if visual_bible else "") or ""
    style_tokens = ""
    if visual_bible and visual_bible.style_pack_json:
        pack = visual_bible.style_pack_json
        style_tokens = str(pack.get("positive_style_suffix", "") or "")
        if isinstance(pack.get("trigger_tokens"), list):
            style_tokens += ", " + ", ".join(pack["trigger_tokens"])

    parts: list[str] = []
    parts.append(style_tokens.strip())
    parts.append(scene.lc.camera)
    parts.append(scene.lc.lighting)
    parts.append(f"mood: {scene.lc.emotional_tone}")

    loc = scene.environment
    loc_bits = [loc.display_name or loc.location_slug.replace("_", " ")]
    loc_bits.append(loc.time_of_day or "")
    if loc.weather:
        loc_bits.append(loc.weather)
    parts.append("environment: " + ", ".join(x for x in loc_bits if x))

    for ch in scene.characters:
        bits = [
            f"character {ch.slug}",
            f"outfit variant {ch.outfit.label}",
        ]
        if ch.appearance_notes:
            bits.append(f"appearance: {ch.appearance_notes}")
        if ch.emotion:
            bits.append(f"emotion {ch.emotion}")
        parts.append("; ".join(bits))

    if scene.creatures:
        crew = []
        for c in scene.creatures:
            label = c.nickname or c.species_key
            crew.append(f"{label} ({c.species_key}, evolution stage {c.stage_key})")
        parts.append("party Pokemon present EXACTLY (do not add or replace): " + "; ".join(crew))

    positive = ". ".join(p for p in parts if p)

    negative = (
        vb_neg
        + ", extra pokemon, wrong pokemon, duplicate characters, costume change, wrong uniform, "
        "extra limbs, text, watermark, logo, low quality"
    )

    seed = _stable_seed(str(scene.scope_id), scene.scene_label)
    pack = (visual_bible.style_pack_json if visual_bible else None) or {}
    if isinstance(pack, dict) and pack.get("seed_override") is not None:
        try:
            seed = int(pack["seed_override"])
        except (TypeError, ValueError):
            pass

    ip_w = None
    if visual_bible and isinstance(visual_bible.style_pack_json, dict):
        ip_w = visual_bible.style_pack_json.get("ip_adapter_weight")
        try:
            ip_w = float(ip_w) if ip_w is not None else None
        except (TypeError, ValueError):
            ip_w = None

    recipe = DiffusionRecipe(
        model_id=image_model_id,
        positive=positive.strip(),
        negative=negative.strip(),
        seed=seed,
        guidance_scale=float(os.getenv("CANON_IMAGE_GUIDANCE", "7.5")),
        num_inference_steps=int(os.getenv("CANON_IMAGE_STEPS", "28")),
        ip_adapter_weight=ip_w,
        provenance={"scene_label": scene.scene_label, "scope_id": str(scene.scope_id)},
    )
    return recipe


def strengthen_negative_for_repair(recipe: DiffusionRecipe, attempt: int) -> DiffusionRecipe:
    extra = " inconsistent outfit, character drift, species swap, wrong evolution"
    return recipe.model_copy(
        update={
            "negative": (recipe.negative + extra * attempt).strip(),
            "guidance_scale": min(12.0, recipe.guidance_scale + 0.5 * attempt),
        }
    )
