"""Dựng DiffusionRecipe từ SceneGraph và VisualBible, không viết raw prompt thủ công."""

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

    # Natural descriptive prose compiler optimized for FLUX models
    is_flux = "flux" in image_model_id.lower()
    
    if is_flux:
        # Build natural descriptive prose paragraph
        prose_parts = []
        
        # Style prefixes first
        if style_tokens:
            prose_parts.append(style_tokens.strip())
            
        # Camera & framing
        camera_frame = f"A {scene.lc.camera} showing a character."
        prose_parts.append(camera_frame)
        
        # Character appearance and their active action/pose
        for ch in scene.characters:
            char_desc = ""
            if ch.appearance_notes:
                # Clean up any potential json structures or tags
                desc = ch.appearance_notes.strip()
                if desc.lower().startswith("kaelen is ") or desc.lower().startswith("eldrin is "):
                    char_desc = desc
                else:
                    char_desc = f"The character {ch.slug} is a wizard/rogue: {desc}."
            else:
                char_desc = f"A character named {ch.slug}."
                
            if ch.action:
                action_text = ch.action.strip()
                # Ensure correct verb agreement or casing
                if action_text.lower().startswith("kaelen ") or action_text.lower().startswith("eldrin "):
                    char_desc += f" Currently, {action_text}."
                else:
                    char_desc += f" Currently, the character is {action_text}."
            
            if ch.emotion:
                char_desc += f" The character has a {ch.emotion} facial expression."
                
            prose_parts.append(char_desc)

        # Environmental setting
        loc = scene.environment
        loc_name = loc.display_name or loc.location_slug.replace("_", " ")
        env_desc = f"The setting is a {loc_name} during the {loc.time_of_day or 'golden hour'}."
        if scene.lc.lighting:
            env_desc += f" The scene features {scene.lc.lighting}."
        prose_parts.append(env_desc)

        positive = " ".join(p for p in prose_parts if p)
    else:
        # Legacy structured prompt formatting
        parts: list[str] = []
        parts.append(style_tokens.strip())

        for ch in scene.characters:
            bits = []
            if ch.action:
                bits.append(ch.action)
            bits.append(f"character {ch.slug}")
            bits.append(f"outfit variant {ch.outfit.label}")
            if ch.appearance_notes:
                bits.append(f"appearance: {ch.appearance_notes}")
            if ch.emotion:
                bits.append(f"emotion {ch.emotion}")
            parts.append("; ".join(bits))

        parts.append(scene.lc.camera)
        parts.append(scene.lc.lighting)
        parts.append(f"mood: {scene.lc.emotional_tone}")

        loc = scene.environment
        loc_bits = [loc.display_name or loc.location_slug.replace("_", " ")]
        loc_bits.append(loc.time_of_day or "")
        if loc.weather:
            loc_bits.append(loc.weather)
        parts.append("environment: " + ", ".join(x for x in loc_bits if x))

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
