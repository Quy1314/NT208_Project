-- =====================================================
-- AI Content Generator - Product-ready PostgreSQL schema
-- =====================================================
-- Notes:
-- 1) This script is safe to run on a fresh database.
-- 2) Existing core fields from current backend are preserved:
--    users(email, password_hash, is_remember), projects(title, prompt, content).
-- 3) Backward-compat mapping for current backend:
--    - models.Project.user_id  -> projects.owner_id
--    - auth/projects endpoints can keep reading prompt/content unchanged.
-- 4) Suggested migration from old schema:
--    ALTER TABLE projects RENAME COLUMN user_id TO owner_id;
--    -- Then re-create FK/index with new column name if needed.

BEGIN;

-- --------------------
-- Extensions
-- --------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- --------------------
-- Shared update trigger
-- --------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------
-- Identity domain
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
-- Collaboration domain
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
-- Project/content domain
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
    -- Compatibility with current backend payload.
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
-- AI generation domain
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
-- Governance / auditing
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
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_context_entries_project_id ON project_context_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_entries_created_at ON project_context_entries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_chapters_project_id ON project_chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_chapter_id ON project_versions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_project_context_project_id ON project_context_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_chapter_id ON project_context_memories(chapter_id);

CREATE INDEX IF NOT EXISTS idx_generation_requests_project_id ON generation_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_requests_status ON generation_requests(status);
CREATE INDEX IF NOT EXISTS idx_generation_requests_requested_at ON generation_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_requests_requested_by ON generation_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- --------------------
-- Triggers: updated_at maintenance
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

COMMIT;
