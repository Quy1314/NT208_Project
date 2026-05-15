## 1. Schema Review and Compatibility

- [x] 1.1 Review backend SQLAlchemy models and API queries that depend on `users`, `projects`, `project_context_entries`, and AI generation tables
- [x] 1.2 Verify `database_schema.sql` preserves current backend-compatible columns and types
- [x] 1.3 Identify existing indexes that are redundant, misnamed, or less useful than composite alternatives

## 2. Performance Index Optimization

- [x] 2.1 Add partial/composite indexes for active user and team project listings
- [x] 2.2 Add queue-oriented indexes for `generation_requests` by status and request time
- [x] 2.3 Add canon timeline and lookup indexes for scope, event ordering, chapter, relationship, and party queries
- [x] 2.4 Add lore retrieval indexes for chunks, assets, source, chapter, and scope access patterns
- [x] 2.5 Add selective JSONB GIN indexes for searchable metadata and payload columns

## 3. Integrity and Idempotency Improvements

- [x] 3.1 Review foreign-key delete behavior for ownership, dependent content, canon, and asset tables
- [x] 3.2 Keep schema bootstrap idempotent with `IF NOT EXISTS` patterns and non-destructive changes
- [x] 3.3 Add or refine comments documenting migration caveats for populated databases
- [x] 3.4 Document optional `pgvector` migration path without requiring it in the base schema

## 4. Validation

- [x] 4.1 Validate SQL syntax and transaction safety for the updated schema
- [x] 4.2 Run OpenSpec validation/status for `optimize-database-schema`
- [x] 4.3 Summarize the applied schema optimization and any remaining deployment caveats
