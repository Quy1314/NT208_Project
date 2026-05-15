-- =====================================================
-- AI Content Generator - schema PostgreSQL sẵn sàng production
-- =====================================================
-- Ghi chú:
-- 1) Script này an toàn khi chạy trên database mới.
-- 2) Giữ nguyên các field lõi backend hiện tại:
--    users(email, password_hash, is_remember), projects(title, prompt, content).
-- 3) Ánh xạ tương thích ngược cho backend hiện tại:
--    - models.Project.user_id  -> projects.owner_id
--    - endpoint auth/projects vẫn đọc prompt/content như cũ.
-- 4) Bao gồm bảng tương thích cho model SQLAlchemy hiện tại:
--    password_reset_tokens, team_workspaces, project_team_tokens, audio_files, audio_jobs.
-- 5) Gợi ý migrate từ schema cũ:
--    ALTER TABLE projects RENAME COLUMN user_id TO owner_id;
--    -- Sau đó tạo lại FK/index theo tên cột mới nếu cần.
-- 6) Với database production đã có dữ liệu lớn, tạo index trong migration riêng bằng
--    CREATE INDEX CONCURRENTLY ngoài transaction block này.

BEGIN;

-- --------------------
-- Extensions
-- --------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- --------------------
-- Trigger cập nhật dùng chung
-- --------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------
-- Nhóm định danh
-- --------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    avatar_url TEXT,
    is_remember BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(120) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    last4 CHAR(4),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider, key_name)
);

-- --------------------
-- Nhóm cộng tác
-- --------------------
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

-- --------------------
-- Nhóm project/nội dung
-- --------------------
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(30) NOT NULL DEFAULT 'novel'
        CHECK (content_type IN ('novel', 'comic_script', 'video_script', 'lyrics', 'other')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'team', 'shared_link')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    -- Tương thích payload backend hiện tại.
    prompt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Lịch sử từng lượt sinh nội dung (đồng bộ backend SQLAlchemy: project_context_entries).
-- ON DELETE CASCADE: xóa project thì xóa hết dòng context phụ thuộc.
CREATE TABLE IF NOT EXISTS project_context_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    language VARCHAR(20) NOT NULL DEFAULT 'vietnamese',
    generated_content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nếu bảng đã tạo trước đó mà thiếu CASCADE trên FK, chạy tay:
-- ALTER TABLE project_context_entries DROP CONSTRAINT IF EXISTS project_context_entries_project_id_fkey;
-- ALTER TABLE project_context_entries ADD CONSTRAINT project_context_entries_project_id_fkey
--   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Bảng tương thích phản ánh model SQLAlchemy hiện tại.
-- Chỉ thêm mới để bootstrap schema khớp với Base.metadata.create_all().
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_team_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    audio_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    language VARCHAR(20) NOT NULL DEFAULT 'vietnamese',
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'done', 'failed')),
    result_path TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('owner', 'editor', 'viewer')),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    permission VARCHAR(20) NOT NULL DEFAULT 'read'
        CHECK (permission IN ('read', 'comment', 'edit')),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_no INT NOT NULL CHECK (chapter_no > 0),
    title VARCHAR(255),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, chapter_no)
);

CREATE TABLE IF NOT EXISTS project_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES project_chapters(id) ON DELETE SET NULL,
    version_no INT NOT NULL CHECK (version_no > 0),
    source VARCHAR(20) NOT NULL DEFAULT 'ai'
        CHECK (source IN ('ai', 'manual', 'import')),
    prompt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    change_note TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, version_no)
);

CREATE TABLE IF NOT EXISTS project_context_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES project_chapters(id) ON DELETE CASCADE,
    memory_type VARCHAR(30) NOT NULL
        CHECK (memory_type IN ('character', 'plot', 'world', 'style', 'fact', 'other')),
    key VARCHAR(120) NOT NULL,
    value TEXT NOT NULL,
    importance SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
    source_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, memory_type, key)
);

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    color VARCHAR(16),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, name)
);

CREATE TABLE IF NOT EXISTS project_tags (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES project_chapters(id) ON DELETE SET NULL,
    version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    storage_provider VARCHAR(30) NOT NULL DEFAULT 'supabase'
        CHECK (storage_provider IN ('supabase', 's3', 'local', 'other')),
    storage_path TEXT NOT NULL,
    checksum_sha256 CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------
-- Nhóm sinh nội dung AI
-- --------------------
CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    base_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_key VARCHAR(120) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    model_type VARCHAR(30) NOT NULL DEFAULT 'text_generation'
        CHECK (model_type IN ('text_generation', 'chat', 'embedding', 'other')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, model_key)
);

CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    content_type VARCHAR(30) NOT NULL DEFAULT 'novel'
        CHECK (content_type IN ('novel', 'comic_script', 'video_script', 'lyrics', 'other')),
    template_text TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES project_chapters(id) ON DELETE SET NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    prompt_input TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    error_message TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS generation_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE REFERENCES generation_requests(id) ON DELETE CASCADE,
    output_text TEXT NOT NULL,
    token_usage_input INT CHECK (token_usage_input >= 0),
    token_usage_output INT CHECK (token_usage_output >= 0),
    latency_ms INT CHECK (latency_ms >= 0),
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------
-- Quản trị / audit
-- --------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------
-- Indexes
-- --------------------
-- Index lõi cho định danh và tương thích.
CREATE INDEX IF NOT EXISTS idx_users_status_deleted_at ON users(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_team_workspaces_owner_id ON team_workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_team_tokens_project_id ON project_team_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_tokens_team_id ON project_team_tokens(team_id);
CREATE INDEX IF NOT EXISTS idx_project_team_tokens_token ON project_team_tokens(token);
CREATE INDEX IF NOT EXISTS idx_audio_files_project_id ON audio_files(project_id);
CREATE INDEX IF NOT EXISTS idx_audio_jobs_user_id ON audio_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_jobs_status_created_at ON audio_jobs(status, created_at DESC);

-- Index cho cộng tác và dashboard project.
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_active ON teams(owner_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_user_role ON team_members(user_id, role);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_owner_active_updated ON projects(owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_team_active_updated ON projects(team_id, updated_at DESC) WHERE deleted_at IS NULL AND team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_owner_status ON projects(owner_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_context_entries_project_id ON project_context_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_entries_created_at ON project_context_entries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_shares_project_id ON project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_token_active ON project_shares(token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_chapters_project_id ON project_chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_project_chapters_project_status ON project_chapters(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_chapter_id ON project_versions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_created ON project_versions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_context_project_id ON project_context_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_chapter_id ON project_context_memories(chapter_id);
CREATE INDEX IF NOT EXISTS idx_project_context_project_type ON project_context_memories(project_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_tags_team_name ON tags(team_id, name);
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_chapter_id ON attachments(chapter_id);

-- Index cho queue/lịch sử sinh AI.
CREATE INDEX IF NOT EXISTS idx_ai_models_provider_active ON ai_models(provider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_owner ON prompt_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_team ON prompt_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_generation_requests_project_id ON generation_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_requests_status ON generation_requests(status);
CREATE INDEX IF NOT EXISTS idx_generation_requests_requested_at ON generation_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_requests_requested_by ON generation_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_generation_requests_queue ON generation_requests(status, requested_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_generation_requests_project_history ON generation_requests(project_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_outputs_created_at ON generation_outputs(created_at DESC);

-- Index cho quản trị/audit.
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_team_id ON audit_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Index JSONB GIN chọn lọc cho field thường lọc/tìm kiếm.
CREATE INDEX IF NOT EXISTS idx_generation_requests_parameters_gin ON generation_requests USING GIN (parameters);
CREATE INDEX IF NOT EXISTS idx_generation_outputs_raw_response_gin ON generation_outputs USING GIN (raw_response);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata);

-- --------------------
-- Triggers: duy trì updated_at
-- --------------------
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
CREATE TRIGGER trg_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_project_chapters_updated_at ON project_chapters;
CREATE TRIGGER trg_project_chapters_updated_at
BEFORE UPDATE ON project_chapters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_project_context_memories_updated_at ON project_context_memories;
CREATE TRIGGER trg_project_context_memories_updated_at
BEFORE UPDATE ON project_context_memories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prompt_templates_updated_at ON prompt_templates;
CREATE TRIGGER trg_prompt_templates_updated_at
BEFORE UPDATE ON prompt_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------
-- Nhóm Canon / Lore (từ migration 002)
-- --------------------
-- canon_scope: mỗi project một scope (MVP)
CREATE TABLE IF NOT EXISTS canon_scope (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_canon_scope_project ON canon_scope(project_id);

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

CREATE TABLE IF NOT EXISTS party_slot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_character_id UUID NOT NULL REFERENCES canon_character(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL CHECK (slot_index >= 1 AND slot_index <= 12),
    creature_instance_id UUID NOT NULL REFERENCES creature_instance(id) ON DELETE CASCADE,
    CONSTRAINT uq_party_slot_owner_idx UNIQUE (owner_character_id, slot_index),
    CONSTRAINT uq_party_owner_creature UNIQUE (owner_character_id, creature_instance_id)
);
CREATE INDEX IF NOT EXISTS ix_party_slot_owner ON party_slot(owner_character_id);

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

CREATE TABLE IF NOT EXISTS world_state_kv (
    scope_id UUID NOT NULL REFERENCES canon_scope(id) ON DELETE CASCADE,
    key VARCHAR(160) NOT NULL,
    value_json JSONB NOT NULL DEFAULT '{}',
    updated_at_event_id UUID REFERENCES canon_event(id) ON DELETE SET NULL,
    PRIMARY KEY (scope_id, key)
);

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
CREATE INDEX IF NOT EXISTS ix_lore_chunk_scope_source ON lore_chunk(scope_id, source, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_lore_chunk_entities_gin ON lore_chunk USING GIN (entity_ids);

-- Đường dẫn vector search tùy chọn:
-- 1) Cài pgvector riêng khi môi trường deploy hỗ trợ:
--    CREATE EXTENSION IF NOT EXISTS vector;
-- 2) Chọn kích thước embedding cố định cho model embedding đã chọn.
-- 3) Trong migration riêng, thêm/chuyển cột vector, backfill dữ liệu, ANALYZE,
--    rồi tạo ANN index ngoài transaction cho bảng lớn đã có dữ liệu.
-- Chỉ là ví dụ, dimension phải khớp model embedding:
-- ALTER TABLE lore_chunk ADD COLUMN embedding_vec vector(1536);
-- CREATE INDEX CONCURRENTLY ix_lore_chunk_embedding_vec_ivfflat ON lore_chunk
--   USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists = 100);

-- --------------------
-- Visual bible & assets
-- --------------------
CREATE TABLE IF NOT EXISTS visual_bible (
    scope_id UUID PRIMARY KEY REFERENCES canon_scope(id) ON DELETE CASCADE,
    style_pack_json JSONB NOT NULL DEFAULT '{}',
    palette_json JSONB NOT NULL DEFAULT '{}',
    negative_bank TEXT NOT NULL DEFAULT '',
    creature_rules_json JSONB NOT NULL DEFAULT '{}',
    cinematic_rules_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS ix_lore_asset_scope_kind ON lore_asset(scope_id, kind);
CREATE INDEX IF NOT EXISTS ix_lore_asset_meta_gin ON lore_asset USING GIN (meta_json);

-- Index tra cứu canon/lore và JSONB đặt gần domain để dễ đọc.
CREATE INDEX IF NOT EXISTS ix_canon_event_scope_t_desc ON canon_event(scope_id, t_index DESC);
CREATE INDEX IF NOT EXISTS ix_canon_event_scope_chapter_scene ON canon_event(scope_id, chapter_no, scene_no);
CREATE INDEX IF NOT EXISTS ix_canon_event_payload_gin ON canon_event USING GIN (payload_json);
CREATE INDEX IF NOT EXISTS ix_canon_character_personality_gin ON canon_character USING GIN (personality_json);
CREATE INDEX IF NOT EXISTS ix_character_visual_variant_face_marks_gin ON character_visual_variant USING GIN (face_marks_json);
CREATE INDEX IF NOT EXISTS ix_character_visual_variant_ref_assets_gin ON character_visual_variant USING GIN (ref_asset_ids);
CREATE INDEX IF NOT EXISTS ix_creature_instance_condition_gin ON creature_instance USING GIN (condition_json);
CREATE INDEX IF NOT EXISTS ix_canon_location_env_tags_gin ON canon_location USING GIN (env_style_tags);
CREATE INDEX IF NOT EXISTS ix_relationship_edge_from ON relationship_edge(scope_id, from_character_id);
CREATE INDEX IF NOT EXISTS ix_relationship_edge_to ON relationship_edge(scope_id, to_character_id);
CREATE INDEX IF NOT EXISTS ix_relationship_edge_payload_gin ON relationship_edge USING GIN (payload_json);
CREATE INDEX IF NOT EXISTS ix_world_state_value_gin ON world_state_kv USING GIN (value_json);
CREATE INDEX IF NOT EXISTS ix_visual_bible_style_pack_gin ON visual_bible USING GIN (style_pack_json);
CREATE INDEX IF NOT EXISTS ix_visual_bible_palette_gin ON visual_bible USING GIN (palette_json);
CREATE INDEX IF NOT EXISTS ix_visual_bible_creature_rules_gin ON visual_bible USING GIN (creature_rules_json);
CREATE INDEX IF NOT EXISTS ix_visual_bible_cinematic_rules_gin ON visual_bible USING GIN (cinematic_rules_json);

COMMIT;
