"""Tải dữ liệu canon cho compile scene và context truyện."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import desc

from lore.db_models import (
    CanonCharacter,
    CanonEvent,
    CanonLocation,
    CanonScope,
    CharacterVisualVariant,
    CreatureInstance,
    PartySlot,
    VisualBible,
    WorldStateKV,
)


def get_character_by_slug(db: Session, scope_id: uuid.UUID, slug: str) -> CanonCharacter | None:
    return (
        db.query(CanonCharacter)
        .filter(CanonCharacter.scope_id == scope_id, CanonCharacter.slug == slug.lower().strip())
        .first()
    )


def list_characters(db: Session, scope_id: uuid.UUID) -> list[CanonCharacter]:
    return db.query(CanonCharacter).filter(CanonCharacter.scope_id == scope_id).order_by(CanonCharacter.slug).all()


def latest_visual_variant(db: Session, character_id: uuid.UUID) -> CharacterVisualVariant | None:
    return (
        db.query(CharacterVisualVariant)
        .filter(CharacterVisualVariant.character_id == character_id)
        .order_by(desc(CharacterVisualVariant.created_at))
        .first()
    )


def get_party_rows(db: Session, owner_character_id: uuid.UUID) -> list[PartySlot]:
    return (
        db.query(PartySlot)
        .filter(PartySlot.owner_character_id == owner_character_id)
        .order_by(PartySlot.slot_index.asc())
        .all()
    )


def get_creature(db: Session, cid: uuid.UUID) -> CreatureInstance | None:
    return db.query(CreatureInstance).filter(CreatureInstance.id == cid).first()


def get_location_by_slug(db: Session, scope_id: uuid.UUID, slug: str) -> CanonLocation | None:
    return (
        db.query(CanonLocation)
        .filter(CanonLocation.scope_id == scope_id, CanonLocation.slug == slug.lower().strip())
        .first()
    )


def get_visual_bible(db: Session, scope_id: uuid.UUID) -> VisualBible | None:
    return db.query(VisualBible).filter(VisualBible.scope_id == scope_id).first()


def list_world_kv(db: Session, scope_id: uuid.UUID, limit: int = 40) -> list[WorldStateKV]:
    return db.query(WorldStateKV).filter(WorldStateKV.scope_id == scope_id).limit(limit).all()


def recent_events(db: Session, scope_id: uuid.UUID, n: int = 12) -> list[CanonEvent]:
    return (
        db.query(CanonEvent)
        .filter(CanonEvent.scope_id == scope_id)
        .order_by(desc(CanonEvent.t_index))
        .limit(n)
        .all()
    )


def next_event_index(db: Session, scope_id: uuid.UUID) -> int:
    row = db.query(CanonEvent.t_index).filter(CanonEvent.scope_id == scope_id).order_by(desc(CanonEvent.t_index)).limit(1).scalar()
    return int(row or 0) + 1


def list_locations(db: Session, scope_id: uuid.UUID) -> list[CanonLocation]:
    return db.query(CanonLocation).filter(CanonLocation.scope_id == scope_id).order_by(CanonLocation.slug).all()


def ensure_default_visual_variant(db: Session, character_id: uuid.UUID) -> CharacterVisualVariant:
    existing = latest_visual_variant(db, character_id)
    if existing:
        return existing
    row = CharacterVisualVariant(
        character_id=character_id,
        label="default",
        outfit_summary="generic attire consistent with story",
        face_marks_json=[],
        ref_asset_ids=[],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def format_structured_context_pack(
    db: Session,
    scope_id: uuid.UUID,
    focus_character_slug: str | None,
) -> str:
    """Fact canon dễ đọc cho context LLM, không phải prose sliding-window."""
    lines: list[str] = ["=== CANON FACTS (structured; obey over prose drift) ==="]

    chars = list_characters(db, scope_id)
    if not chars:
        lines.append("(No characters registered in canon DB yet.)")
    for ch in chars:
        marker = " *focus*" if focus_character_slug and ch.slug == focus_character_slug.lower().strip() else ""
        lines.append(f"- Character [{ch.slug}] {ch.display_name}{marker}")
        vv = latest_visual_variant(db, ch.id)
        if vv:
            marks = vv.face_marks_json or []
            lines.append(f"  outfit ({vv.label}): {vv.outfit_summary}")
            if marks:
                lines.append(f"  face marks: {marks}")
        party = get_party_rows(db, ch.id)
        if party:
            lines.append("  party:")
            for ps in party:
                cr = get_creature(db, ps.creature_instance_id)
                if cr:
                    nick = cr.nickname or cr.species_key
                    lines.append(f"    slot {ps.slot_index}: {nick} [{cr.species_key}] stage={cr.stage_key}")

    for kv in list_world_kv(db, scope_id):
        lines.append(f"- world[{kv.key}] = {kv.value_json}")

    for ev in recent_events(db, scope_id, n=8):
        lines.append(f"- event t={ev.t_index} [{ev.kind}]: {ev.summary}")

    vb = get_visual_bible(db, scope_id)
    if vb:
        lines.append(f"- visual bible negatives (prefix): {vb.negative_bank[:400]}...")

    return "\n".join(lines)


def project_has_canon_characters(db: Session, project_id: uuid.UUID) -> bool:
    from retrieval.service import get_scope_for_project

    scope = get_scope_for_project(db, project_id)
    if not scope:
        return False
    n = db.query(CanonCharacter).filter(CanonCharacter.scope_id == scope.id).count()
    return n > 0
