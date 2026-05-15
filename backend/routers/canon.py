"""REST API bootstrap lore canon theo canon_scope từng project."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import lore.db_models as lore_models
from auth import get_current_user
from database import get_db
import models
from retrieval.service import ensure_canon_scope, get_scope_for_project, reindex_project_prose
from routers.projects import _project_uuid  # reuse UUID helper
from services import canon_queries as cq


router = APIRouter(prefix="/api/projects/{project_id}/canon", tags=["Canon Lore"])


def _ensure_owner(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> models.Project:
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found.")
    if p.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden.")
    return p


class ScopeResp(BaseModel):
    scope_id: str


@router.post("/scope", response_model=ScopeResp)
def ensure_scope(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    return ScopeResp(scope_id=str(scope.id))


class CharacterCreate(BaseModel):
    slug: str
    display_name: str


class CharacterResp(BaseModel):
    id: str
    slug: str
    display_name: str


@router.post("/characters", response_model=CharacterResp)
def create_character(
    project_id: str,
    body: CharacterCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    slug = body.slug.strip().lower().replace(" ", "_")
    if cq.get_character_by_slug(db, scope.id, slug):
        raise HTTPException(status_code=400, detail="Character slug already exists.")
    row = lore_models.CanonCharacter(scope_id=scope.id, slug=slug, display_name=body.display_name.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    cq.ensure_default_visual_variant(db, row.id)
    db.commit()
    return CharacterResp(id=str(row.id), slug=row.slug, display_name=row.display_name)


class VariantUpsert(BaseModel):
    character_slug: str
    label: str
    outfit_summary: str = ""
    face_marks_json: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/visual-variant")
def upsert_visual_variant(
    project_id: str,
    body: VariantUpsert,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    ch = cq.get_character_by_slug(db, scope.id, body.character_slug)
    if not ch:
        raise HTTPException(status_code=400, detail="Unknown character_slug.")
    row = lore_models.CharacterVisualVariant(
        character_id=ch.id,
        label=body.label.strip(),
        outfit_summary=body.outfit_summary.strip(),
        face_marks_json=body.face_marks_json,
        ref_asset_ids=[],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"variant_id": str(row.id)}


class CreatureCreate(BaseModel):
    species_key: str
    stage_key: str = "unknown"
    nickname: str | None = None


class CreatureResp(BaseModel):
    id: str


@router.post("/creatures", response_model=CreatureResp)
def create_creature(
    project_id: str,
    body: CreatureCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    row = lore_models.CreatureInstance(
        scope_id=scope.id,
        species_key=body.species_key.strip().lower(),
        stage_key=body.stage_key.strip().lower(),
        nickname=(body.nickname or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CreatureResp(id=str(row.id))


class PartyRebuild(BaseModel):
    owner_slug: str
    creature_instance_ids: list[str]


@router.post("/party/rebuild")
def rebuild_party(
    project_id: str,
    body: PartyRebuild,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    owner = cq.get_character_by_slug(db, scope.id, body.owner_slug)
    if not owner:
        raise HTTPException(status_code=400, detail="Unknown owner_slug.")
    db.query(lore_models.PartySlot).filter(lore_models.PartySlot.owner_character_id == owner.id).delete()
    for idx, cid in enumerate(body.creature_instance_ids, start=1):
        try:
            c_uuid = uuid.UUID(str(cid))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid creature id {cid}")
        cr = cq.get_creature(db, c_uuid)
        if not cr or cr.scope_id != scope.id:
            raise HTTPException(status_code=400, detail=f"Creature {cid} not in this scope.")
        db.add(
            lore_models.PartySlot(
                owner_character_id=owner.id,
                slot_index=idx,
                creature_instance_id=c_uuid,
            )
        )
    db.commit()
    return {"ok": True, "slots": len(body.creature_instance_ids)}


class LocationCreate(BaseModel):
    slug: str
    display_name: str
    env_style_tags: list[str] = Field(default_factory=list)


@router.post("/locations")
def create_location(
    project_id: str,
    body: LocationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    slug = body.slug.strip().lower().replace(" ", "_")
    if cq.get_location_by_slug(db, scope.id, slug):
        raise HTTPException(status_code=400, detail="Location slug exists.")
    row = lore_models.CanonLocation(
        scope_id=scope.id,
        slug=slug,
        display_name=body.display_name.strip(),
        env_style_tags=body.env_style_tags,
    )
    db.add(row)
    db.commit()
    return {"id": str(row.id), "slug": row.slug}


class VisualBibleUpsert(BaseModel):
    style_pack_json: dict[str, Any] = Field(default_factory=dict)
    palette_json: dict[str, Any] = Field(default_factory=dict)
    negative_bank: str = ""
    creature_rules_json: dict[str, Any] = Field(default_factory=dict)
    cinematic_rules_json: dict[str, Any] = Field(default_factory=dict)


@router.put("/visual-bible")
def upsert_visual_bible(
    project_id: str,
    body: VisualBibleUpsert,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    row = cq.get_visual_bible(db, scope.id)
    if row:
        row.style_pack_json = body.style_pack_json
        row.palette_json = body.palette_json
        row.negative_bank = body.negative_bank
        row.creature_rules_json = body.creature_rules_json
        row.cinematic_rules_json = body.cinematic_rules_json
    else:
        row = lore_models.VisualBible(
            scope_id=scope.id,
            style_pack_json=body.style_pack_json,
            palette_json=body.palette_json,
            negative_bank=body.negative_bank,
            creature_rules_json=body.creature_rules_json,
            cinematic_rules_json=body.cinematic_rules_json,
        )
        db.add(row)
    db.commit()
    return {"ok": True}


@router.post("/reindex")
def reindex(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    pid = _project_uuid(project_id)
    proj = _ensure_owner(db, pid, current_user.id)
    scope = ensure_canon_scope(db, pid)
    n = reindex_project_prose(db, scope.id, proj.content or "", x_hf_api_key, replace=True)
    return {"chunks_indexed": n}


@router.get("/overview")
def canon_overview(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    _ensure_owner(db, pid, current_user.id)
    scope = get_scope_for_project(db, pid)
    if not scope:
        return {"scope": None}
    chars = cq.list_characters(db, scope.id)
    locs = cq.list_locations(db, scope.id)
    return {
        "scope_id": str(scope.id),
        "characters": [{"slug": c.slug, "display_name": c.display_name, "id": str(c.id)} for c in chars],
        "locations": [{"slug": L.slug, "display_name": L.display_name} for L in locs],
        "chunk_count": db.query(lore_models.LoreChunk).filter(lore_models.LoreChunk.scope_id == scope.id).count(),
    }
