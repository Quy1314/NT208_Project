## Context

`database_schema.sql` is the single source for bootstrapping the PostgreSQL database used by the backend. It already contains product-grade domains: users, teams, projects, project context history, AI generation tracking, audit logs, canon/lore entities, and visual assets. The schema also preserves compatibility with the current backend fields (`users.email`, `users.password_hash`, `users.is_remember`, `projects.owner_id`, `projects.prompt`, `projects.content`).

The optimization should treat the schema as an idempotent bootstrap/migration aid, not as a destructive rewrite. Existing data may already exist in development or Supabase/PostgreSQL environments, so improvements must favor additive indexes, safe constraints, clearer extension checks, and maintainable organization.

## Goals / Non-Goals

**Goals:**

- Improve query performance for known dashboard, project, generation queue, canon timeline, and lore retrieval access patterns.
- Improve data integrity with consistent constraints, foreign-key behavior, and uniqueness where appropriate.
- Keep the schema rerunnable on fresh databases and safe to review before applying to populated databases.
- Preserve backend compatibility and avoid API-facing breaking changes.
- Document optional vector-search setup clearly so deployments without `pgvector` still work.

**Non-Goals:**

- Rewriting backend SQLAlchemy models or API endpoints.
- Splitting the schema into a full migration framework.
- Removing existing tables or columns that may be consumed by current or near-future features.
- Forcing `pgvector` installation in environments where vector search is not needed.

## Decisions

### Decision 1: Optimize additively instead of restructuring destructively

Use additive indexes, safe `CREATE ... IF NOT EXISTS`, refined comments, and compatible constraints. Avoid dropping columns or renaming tables in the initial optimization.

Alternative considered: normalize and split the schema aggressively. Rejected because current backend compatibility and existing data safety are more important for this change.

### Decision 2: Prefer workload-aligned composite and partial indexes

Add indexes that match likely read paths:

- Active project dashboard: `(owner_id, updated_at DESC)` filtered by `deleted_at IS NULL`.
- Team project listing: `(team_id, updated_at DESC)` filtered by `deleted_at IS NULL`.
- Context history: `(project_id, created_at DESC)`.
- Generation queue workers: `(status, requested_at)` for queued/running requests.
- Canon timeline: `(scope_id, t_index)` and chapter/scene lookups.
- Lore and assets: scope/chapter/source and metadata lookup indexes.

Alternative considered: single-column indexes only. Rejected because composite access patterns reduce planner work for the app's most common lists and queues.

### Decision 3: Add JSONB GIN indexes only for searchable JSONB columns

JSONB columns are useful for flexible AI/canon metadata, but GIN indexes add write overhead. Apply them only to columns likely to be filtered/searched, such as generation parameters/raw responses, audit metadata, canon payloads, visual bible JSON, and lore asset metadata.

Alternative considered: index every JSONB column. Rejected because unnecessary GIN indexes can slow writes and increase storage.

### Decision 4: Keep vector search optional but explicit

The existing `lore_chunk.embedding double precision[]` works without `pgvector`, but true ANN search requires `pgvector` and a `vector(n)` column. The optimized schema should document optional pgvector migration/index setup separately instead of making bootstrap fail when `pgvector` is unavailable.

Alternative considered: change `embedding` directly to `vector(1536)`. Rejected because embedding dimensions and extension availability may vary.

### Decision 5: Keep soft-delete behavior explicit

Tables with `deleted_at` or status columns should have indexes that support active-record reads. The schema should avoid implicit hard-delete assumptions for user/project/team records while preserving cascade behavior for dependent content.

Alternative considered: implement row-level security and archival policies here. Rejected as broader than schema optimization and dependent on deployment-specific auth policy.

## Risks / Trade-offs

- Additional indexes increase storage and write overhead → Mitigate by adding only workload-aligned indexes and avoiding blanket indexing.
- Partial indexes improve active-record reads but do not help deleted-record audits → Keep existing broad indexes where useful or add audit-specific indexes separately.
- Existing populated databases may contain data violating new constraints → Prefer additive indexes first and document validation before enforcing stricter constraints.
- Optional vector search can remain underpowered without `pgvector` → Document the explicit opt-in path and keep base schema portable.

## Migration Plan

1. Review existing data in target environments for duplicate or invalid rows before applying stricter uniqueness/constraints.
2. Apply additive index and comment changes to `database_schema.sql`.
3. For populated production databases, create large indexes during a maintenance window or with `CREATE INDEX CONCURRENTLY` in a separate migration script, because `CONCURRENTLY` cannot run inside the current transaction block.
4. If vector search is required, perform a separate pgvector migration after choosing embedding dimensions.
5. Rollback strategy: added indexes can be dropped by name without changing table data or API behavior.

## Open Questions

- Which PostgreSQL environment is the primary target: local PostgreSQL, Supabase, or another managed service?
- Which embedding model/dimension should be standardized before enabling `pgvector`?
- Are canon/lore tables already populated in any shared database, or are they still experimental?
