"""
SQLAlchemy models for canonical lore, retrieval chunks, visual bible, assets.
Requires PostgreSQL + pgvector extension (see migrations/002_canon_multimodal_engine.sql).
"""
from __future__ import annotations

import uuid

from sqlalchemy import (
    BigInteger,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import relationship

from database import Base

# Kích thước MiniLM-L6-v2, mặc định của HF embedding API.
LORE_EMBEDDING_DIM = 384


class CanonScope(Base):
    """Một scope universe canon cho mỗi project trong MVP."""

    __tablename__ = "canon_scope"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    characters = relationship("CanonCharacter", back_populates="scope", cascade="all, delete-orphan")
    locations = relationship("CanonLocation", back_populates="scope", cascade="all, delete-orphan")
    events = relationship("CanonEvent", back_populates="scope", cascade="all, delete-orphan")
    chapters = relationship("CanonChapter", back_populates="scope", cascade="all, delete-orphan")
    lore_chunks = relationship("LoreChunk", back_populates="scope", cascade="all, delete-orphan")
    creatures = relationship("CreatureInstance", back_populates="scope", cascade="all, delete-orphan")


class CanonCharacter(Base):
    __tablename__ = "canon_character"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    slug = Column(String(120), nullable=False)
    display_name = Column(String(255), nullable=False)
    personality_json = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="characters")
    visual_variants = relationship(
        "CharacterVisualVariant",
        back_populates="character",
        foreign_keys="CharacterVisualVariant.character_id",
        cascade="all, delete-orphan",
    )
    party_slots = relationship("PartySlot", back_populates="owner", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("scope_id", "slug", name="uq_canon_character_scope_slug"),)


class CharacterVisualVariant(Base):
    __tablename__ = "character_visual_variant"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    character_id = Column(UUID(as_uuid=True), ForeignKey("canon_character.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    outfit_summary = Column(Text, nullable=False, server_default="")
    face_marks_json = Column(JSONB, nullable=False, server_default="[]")
    ref_asset_ids = Column(JSONB, nullable=False, server_default="[]")  # list of uuid strings
    valid_from_event_id = Column(UUID(as_uuid=True), ForeignKey("canon_event.id", ondelete="SET NULL"), nullable=True)
    valid_until_event_id = Column(UUID(as_uuid=True), ForeignKey("canon_event.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    character = relationship("CanonCharacter", back_populates="visual_variants", foreign_keys=[character_id])


class CreatureInstance(Base):
    __tablename__ = "creature_instance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    species_key = Column(String(120), nullable=False)
    stage_key = Column(String(80), nullable=False, server_default="unknown")
    nickname = Column(String(120), nullable=True)
    condition_json = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="creatures")


class PartySlot(Base):
    __tablename__ = "party_slot"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    owner_character_id = Column(UUID(as_uuid=True), ForeignKey("canon_character.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index = Column(Integer, nullable=False)
    creature_instance_id = Column(UUID(as_uuid=True), ForeignKey("creature_instance.id", ondelete="CASCADE"), nullable=False)

    owner = relationship("CanonCharacter", back_populates="party_slots")
    creature = relationship("CreatureInstance")

    __table_args__ = (
        UniqueConstraint("owner_character_id", "slot_index", name="uq_party_slot_owner_idx"),
        UniqueConstraint("owner_character_id", "creature_instance_id", name="uq_party_owner_creature"),
    )


class CanonLocation(Base):
    __tablename__ = "canon_location"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    slug = Column(String(160), nullable=False)
    display_name = Column(String(255), nullable=False)
    env_style_tags = Column(JSONB, nullable=False, server_default="[]")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="locations")

    __table_args__ = (UniqueConstraint("scope_id", "slug", name="uq_canon_location_scope_slug"),)


class CanonEvent(Base):
    __tablename__ = "canon_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    t_index = Column(BigInteger, nullable=False)
    kind = Column(String(80), nullable=False)
    summary = Column(Text, nullable=False, server_default="")
    payload_json = Column(JSONB, nullable=False, server_default="{}")
    chapter_no = Column(Integer, nullable=True)
    scene_no = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="events")

    __table_args__ = (UniqueConstraint("scope_id", "t_index", name="uq_canon_event_scope_t"),)


class RelationshipEdge(Base):
    __tablename__ = "relationship_edge"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    from_character_id = Column(UUID(as_uuid=True), ForeignKey("canon_character.id", ondelete="CASCADE"), nullable=False)
    to_character_id = Column(UUID(as_uuid=True), ForeignKey("canon_character.id", ondelete="CASCADE"), nullable=False)
    relation = Column(String(120), nullable=False)
    since_event_id = Column(UUID(as_uuid=True), ForeignKey("canon_event.id", ondelete="SET NULL"), nullable=True)
    payload_json = Column(JSONB, nullable=False, server_default="{}")


class CanonChapter(Base):
    __tablename__ = "canon_chapter"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_no = Column(Integer, nullable=False)
    title = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="chapters")

    __table_args__ = (UniqueConstraint("scope_id", "chapter_no", name="uq_canon_chapter_scope_no"),)


class WorldStateKV(Base):
    __tablename__ = "world_state_kv"

    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), primary_key=True)
    key = Column(String(160), primary_key=True)
    value_json = Column(JSONB, nullable=False, server_default="{}")
    updated_at_event_id = Column(UUID(as_uuid=True), ForeignKey("canon_event.id", ondelete="SET NULL"), nullable=True)


class LoreChunk(Base):
    __tablename__ = "lore_chunk"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_no = Column(Integer, nullable=True)
    chunk_index = Column(Integer, nullable=False, server_default="0")
    text = Column(Text, nullable=False)
    embedding = Column(ARRAY(Float), nullable=True)
    entity_ids = Column(JSONB, nullable=False, server_default="[]")
    source = Column(String(40), nullable=False, server_default="project_content")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    scope = relationship("CanonScope", back_populates="lore_chunks")

    __table_args__ = (Index("ix_lore_chunk_scope_chapter", "scope_id", "chapter_no"),)


class VisualBible(Base):
    __tablename__ = "visual_bible"

    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), primary_key=True)
    style_pack_json = Column(JSONB, nullable=False, server_default="{}")
    palette_json = Column(JSONB, nullable=False, server_default="{}")
    negative_bank = Column(Text, nullable=False, server_default="")
    creature_rules_json = Column(JSONB, nullable=False, server_default="{}")
    cinematic_rules_json = Column(JSONB, nullable=False, server_default="{}")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())


class LoreAsset(Base):
    __tablename__ = "lore_asset"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    scope_id = Column(UUID(as_uuid=True), ForeignKey("canon_scope.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(40), nullable=False)
    uri = Column(Text, nullable=False)
    mime_type = Column(String(120), nullable=True)
    meta_json = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


# Sửa forward ref từ active_visual_variant_id sang CharacterVisualVariant.
# SQLAlchemy tự resolve FK; MVP chưa cần remote_side tường minh.
