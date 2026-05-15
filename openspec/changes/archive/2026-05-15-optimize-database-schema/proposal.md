## Why

The current `database_schema.sql` has grown into a broad product-ready schema, but it mixes core application tables, AI generation history, canon/lore structures, optional vector search notes, indexes, and migration guidance in one file. Optimizing the schema will improve query performance, maintainability, and production readiness while preserving compatibility with the current backend fields used by SQLAlchemy and API endpoints.

## What Changes

- Audit and optimize relational constraints, indexes, and naming consistency across identity, projects, AI generation, audit, canon/lore, and visual asset tables.
- Add targeted indexes for high-frequency access patterns such as soft-delete filtering, user/project dashboards, generation request queues, canon entity lookup, timeline ordering, and lore retrieval.
- Improve JSONB-heavy tables with appropriate GIN indexes where metadata and payload search is expected.
- Normalize extension usage and vector-search readiness for `lore_chunk.embedding`, including clear behavior when `pgvector` is not installed.
- Improve idempotency and migration safety for rerunning the schema on existing databases.
- Preserve current backend compatibility for `users(email, password_hash, is_remember)` and `projects(owner_id, title, prompt, content)`.

## Capabilities

### New Capabilities
- `database-schema-optimization`: Covers performance, integrity, idempotency, and maintainability requirements for the PostgreSQL database schema.

### Modified Capabilities

No existing OpenSpec capabilities are present under `openspec/specs/`, so this change introduces a new capability instead of modifying an existing one.

## Impact

- Affected file: `database_schema.sql`.
- Affected systems: PostgreSQL schema initialization, Supabase/PostgreSQL deployments, backend SQLAlchemy compatibility, project/content APIs, AI generation history, canon/lore persistence, and future vector retrieval.
- No API contract changes are intended.
- Potential migration impact: additional indexes and constraint refinements may require validation against existing data before applying to a non-empty production database.
