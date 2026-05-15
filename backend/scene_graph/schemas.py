"""Schema Pydantic cho scene graph và diffusion recipe."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class OutfitRef(BaseModel):
    variant_id: UUID
    label: str


class SceneCreature(BaseModel):
    instance_id: UUID
    species_key: str
    stage_key: str = "unknown"
    nickname: str | None = None
    pose_hint: str | None = None
    relative_position: str | None = None


class SceneCharacter(BaseModel):
    character_id: UUID
    slug: str
    outfit: OutfitRef
    emotion: str = "neutral"
    action: str | None = None
    appearance_notes: str | None = None


class Environment(BaseModel):
    location_slug: str
    display_name: str | None = None
    time_of_day: str = "unspecified"
    weather: str | None = None
    landmark_hints: list[str] = Field(default_factory=list)


class LightingCamera(BaseModel):
    lighting: str = "cinematic balanced light"
    camera: str = "medium wide shot, shallow depth of field"
    emotional_tone: str = "dramatic"


class SceneGraph(BaseModel):
    scope_id: UUID
    chapter_hint: int | None = None
    scene_label: str = "scene"
    characters: list[SceneCharacter] = Field(default_factory=list)
    creatures: list[SceneCreature] = Field(default_factory=list)
    environment: Environment
    lc: LightingCamera = Field(default_factory=LightingCamera)

    @field_validator("creatures")
    @classmethod
    def check_creature_ids_unique(cls, v: list[SceneCreature]) -> list[SceneCreature]:
        ids = [c.instance_id for c in v]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate creature instance in scene graph")
        return v


class DiffusionRecipe(BaseModel):
    model_id: str
    positive: str
    negative: str
    seed: int | None = None
    guidance_scale: float = 7.5
    num_inference_steps: int = 28
    ip_adapter_weight: float | None = None
    controlnet_hint: str | None = None
    layout_instruction: str | None = None
    provenance: dict = Field(default_factory=dict)


class IntentHints(BaseModel):
    character_slug: str | None = None
    location_slug: str | None = None
    time_of_day: str | None = None
    extra_prompt: str | None = None
