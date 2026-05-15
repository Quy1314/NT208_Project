# database-schema-optimization Specification

## Purpose
TBD - created by archiving change optimize-database-schema. Update Purpose after archive.
## Requirements
### Requirement: Preserve backend-compatible schema fields
The optimized database schema MUST preserve the fields currently used by the backend authentication and project APIs.

#### Scenario: Backend authentication fields remain available
- **WHEN** the optimized schema is applied to a fresh database
- **THEN** the `users` table contains `email`, `password_hash`, and `is_remember` columns with compatible types and constraints

#### Scenario: Backend project fields remain available
- **WHEN** the optimized schema is applied to a fresh database
- **THEN** the `projects` table contains `owner_id`, `title`, `prompt`, and `content` columns with compatible types and constraints

### Requirement: Support active project listing efficiently
The optimized database schema SHALL provide indexes that support efficient retrieval of non-deleted projects by owner, team, and recent update time.

#### Scenario: User dashboard project query
- **WHEN** the application queries active projects for a user ordered by most recently updated
- **THEN** the database can use an index aligned with `owner_id`, `updated_at`, and active `deleted_at` filtering

#### Scenario: Team project query
- **WHEN** the application queries active projects for a team ordered by most recently updated
- **THEN** the database can use an index aligned with `team_id`, `updated_at`, and active `deleted_at` filtering

### Requirement: Support generation queue and history queries efficiently
The optimized database schema SHALL provide indexes for common AI generation queue and history access patterns.

#### Scenario: Worker fetches queued generation requests
- **WHEN** a worker queries generation requests by queue status and request time
- **THEN** the database can use an index aligned with `status` and `requested_at`

#### Scenario: User reviews generation history
- **WHEN** the application queries generation requests by requester or project
- **THEN** the database can use indexes aligned with `requested_by` and `project_id`

### Requirement: Support canon and lore lookup efficiently
The optimized database schema SHALL provide indexes for scope-based canon, timeline, relationship, world-state, lore chunk, and asset retrieval.

#### Scenario: Canon timeline retrieval
- **WHEN** the application retrieves canon events for a scope ordered by timeline index
- **THEN** the database can use an index aligned with `scope_id` and `t_index`

#### Scenario: Lore chunk retrieval by chapter
- **WHEN** the application retrieves lore chunks for a scope and chapter
- **THEN** the database can use an index aligned with `scope_id` and `chapter_no`

#### Scenario: Relationship graph lookup
- **WHEN** the application retrieves relationships for a character within a scope
- **THEN** the database can use indexes aligned with the relationship scope and character endpoints

### Requirement: Index searchable JSONB metadata selectively
The optimized database schema SHALL add JSONB GIN indexes only for JSONB columns expected to participate in filtering or metadata search.

#### Scenario: Audit metadata filtering
- **WHEN** the application filters audit logs by metadata fields
- **THEN** the database can use a GIN index on audit metadata

#### Scenario: Canon payload filtering
- **WHEN** the application filters canon or lore records by JSON payload fields
- **THEN** the database can use targeted GIN indexes on searchable JSONB payload columns

### Requirement: Keep vector search optional and documented
The optimized database schema MUST remain executable without requiring `pgvector`, while documenting the optional path for approximate nearest-neighbor search.

#### Scenario: Deployment without pgvector
- **WHEN** the optimized schema is applied to a PostgreSQL database without `pgvector`
- **THEN** schema creation succeeds without vector extension errors

#### Scenario: Deployment enables vector search later
- **WHEN** the project chooses an embedding dimension and installs `pgvector`
- **THEN** the schema documentation provides a clear migration/index path for vector similarity search

### Requirement: Maintain idempotent schema bootstrap behavior
The optimized database schema MUST remain safe to run on a fresh database and SHOULD avoid destructive operations during normal bootstrap.

#### Scenario: Fresh database bootstrap
- **WHEN** the schema is executed against an empty PostgreSQL database
- **THEN** all tables, constraints, indexes, triggers, and helper functions are created successfully

#### Scenario: Existing development database rerun
- **WHEN** the schema is rerun against a compatible development database
- **THEN** existing tables and indexes are not dropped or destructively recreated

