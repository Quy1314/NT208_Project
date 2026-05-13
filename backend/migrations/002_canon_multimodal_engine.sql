-- =====================================================================
-- Migration 002: Canonical lore + pgvector + visual bible + assets
-- Run AFTER core schema (users/projects). Requires PostgreSQL 14+.
-- Safe to run once; uses IF NOT EXISTS where applicable.
-- =====================================================================

BEGIN;

-- Optional: CREATE EXTENSION IF NOT EXISTS vector;
-- MVP dùng cột double precision[] (không cần pgvector) để create_all chạy trên mọi PostgreSQL.
-- canon_scope: one scope per project (MVP)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_scope (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_canon_scope_project ON canon_scope(project_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_character (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    slug VARCHAR(120) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    personality_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_canon_character_scope_slug UNIQUE (scope_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_canon_character_scope ON canon_character(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    t_index BIGINT NOT NULL,
    kind VARCHAR(80) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    payload_json JSONB NOT NULL DEFAULT '{}',
    chapter_no INTEGER,
    scene_no INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_canon_event_scope_t UNIQUE (scope_id, t_index)
);
CREATE INDEX IF NOT EXISTS ix_canon_event_scope ON canon_event(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_visual_variant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES canon_character(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    outfit_summary TEXT NOT NULL DEFAULT '',
    face_marks_json JSONB NOT NULL DEFAULT '[]',
    ref_asset_ids JSONB NOT NULL DEFAULT '[]',
    valid_from_event_id UUID REFERENCES canon_event(id) ON DELETE SET NULL,
    valid_until_event_id UUID REFERENCES canon_event(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_character_visual_variant_char ON character_visual_variant(character_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creature_instance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    species_key VARCHAR(120) NOT NULL,
    stage_key VARCHAR(80) NOT NULL DEFAULT 'unknown',
    nickname VARCHAR(120),
    condition_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_creature_instance_scope ON creature_instance(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS party_slot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_character_id UUID NOT NULL REFERENCES canon_character(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL CHECK (slot_index >= 1 AND slot_index <= 12),
    creature_instance_id UUID NOT NULL REFERENCES creature_instance(id) ON DELETE CASCADE,
    CONSTRAINT uq_party_slot_owner_idx UNIQUE (owner_character_id, slot_index),
    CONSTRAINT uq_party_owner_creature UNIQUE (owner_character_id, creature_instance_id)
);
CREATE INDEX IF NOT EXISTS ix_party_slot_owner ON party_slot(owner_character_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_location (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    slug VARCHAR(160) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    env_style_tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_canon_location_scope_slug UNIQUE (scope_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_canon_location_scope ON canon_location(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationship_edge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    from_character_id UUID NOT NULL REFERENCES canon_character(id) ON DELETE CASCADE,
    to_character_id UUID NOT NULL REFERENCES canon_character(id) ON DELETE CASCADE,
    relation VARCHAR(120) NOT NULL,
    since_event_id UUID REFERENCES canon_event(id) ON DELETE SET NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_relationship_edge_scope ON relationship_edge(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_chapter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    chapter_no INTEGER NOT NULL,
    title VARCHAR(500),
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_canon_chapter_scope_no UNIQUE (scope_id, chapter_no)
);
CREATE INDEX IF NOT EXISTS ix_canon_chapter_scope ON canon_chapter(scope_id);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_state_kv (
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    key VARCHAR(160) NOT NULL,
    value_json JSONB NOT NULL DEFAULT '{}',
    updated_at_event_id UUID REFERENCES canon_event(id) ON DELETE SET NULL,
    PRIMARY KEY (scope_id, key)
);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lore_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    chapter_no INTEGER,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    embedding double precision[],
    entity_ids JSONB NOT NULL DEFAULT '[]',
    source VARCHAR(40) NOT NULL DEFAULT 'project_content',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_lore_chunk_scope_chapter ON lore_chunk(scope_id, chapter_no);

-- Optional ANN index (uncomment after meaningful row count + ANALYZE):
-- CREATE INDEX IF NOT EXISTS ix_lore_chunk_emb_ivfflat ON lore_chunk
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visual_bible (
    scope_id UUID PRIMARY KEY REFERENCES canon_scope(id) ON DELETE CASCADE,
    style_pack_json JSONB NOT NULL DEFAULT '{}',
    palette_json JSONB NOT NULL DEFAULT '{}',
    negative_bank TEXT NOT NULL DEFAULT '',
    creature_rules_json JSONB NOT NULL DEFAULT '{}',
    cinematic_rules_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lore_asset (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL,
    uri TEXT NOT NULL,
    mime_type VARCHAR(120),
    meta_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_lore_asset_scope ON lore_asset(scope_id);

COMMIT;
