## Context

This is a cross-cutting refactor across the backend, frontend, SQL, docs, and API boundary. Current project files already use several valid conventions in isolation, but violations and mixed styles can appear in component files, utility modules, DTOs, JSON schemas, SQL aliases, Python symbols, docs, and generated-by-AI additions. The change must normalize English technical identifiers without changing business logic or user-facing runtime text.

The repository contains:
- Python/FastAPI backend modules under `backend/`.
- SQL schema and migrations in `database_schema.sql` and `backend/migrations/`.
- Next.js/React TypeScript frontend under `frontend/src/`.
- Documentation under `docs/` and OpenSpec files under `openspec/`.

## Goals / Non-Goals

**Goals:**
- Establish a single official naming convention document in `docs/ai_conventions.md`.
- Rename English technical identifiers to exactly one style per category.
- Rename files/folders/import/export/reference paths together when convention requires it.
- Preserve external contracts by adding explicit mappings/aliases where cross-layer styles differ.
- Verify refactor safety with searches plus frontend/backend build or syntax checks.

**Non-Goals:**
- Do not translate or rename Vietnamese comments/content.
- Do not change business logic, UX copy, database data values, authentication behavior, or generated outputs.
- Do not rename third-party package APIs, framework-required names, public protocol names, or vendor/generated files.
- Do not force React route folder names into PascalCase; Next.js route segments and URL paths remain URL-stable unless explicitly approved.

## Decisions

### 1. Treat naming by semantic category, not by language file alone

- TypeScript variables/functions/hooks: `camelCase`.
- React components and classes/types that represent components/classes: `PascalCase`.
- TypeScript type/interface names that represent DTOs/schemas/classes: `PascalCase`.
- Python files/modules and database identifiers: `snake_case`.
- Constants and environment variables: `UPPER_SNAKE_CASE`.

Rationale: The same repository spans Python, SQL, and TypeScript. A category-based rule avoids forcing one ecosystem's convention onto another.

Alternative considered: make all symbols in TypeScript camelCase except React components. Rejected because types/interfaces/classes conventionally use PascalCase and renaming them to camelCase would reduce readability.

### 2. Preserve external API and database contracts with explicit mappings

When a frontend camelCase field maps to a backend/database snake_case field, the implementation will add or preserve serializer aliases, DTO transforms, API adapter mapping, SQL aliases, or ORM field mapping as appropriate.

Rationale: Internal consistency must not break serialized JSON, SQL column references, or persisted database schema unexpectedly.

Alternative considered: rename all API JSON keys to camelCase. Rejected unless the project explicitly accepts a breaking API contract change.

### 3. Use staged rename workflow with reference validation

Implementation should proceed in layers:
1. Inventory files and existing naming violations.
2. Classify each candidate as safe rename, external contract, framework-required, or exempt.
3. Rename files/folders first with import/reference updates.
4. Rename symbols with language-aware or carefully searched replacements.
5. Update DTO/API/SQL mappings.
6. Verify with build/test/search checks.

Rationale: Broad global replacements are unsafe for identifiers shared across strings, API payloads, and SQL.

Alternative considered: automated regex-only replacement. Rejected because it can corrupt strings, migrations, docs, and external contracts.

### 4. Documentation is part of the change

`docs/ai_conventions.md` will become the canonical instruction set for both humans and AI agents. It must include rules, examples, anti-examples, and safety rules.

Rationale: The user explicitly requested a durable guide to prevent future drift.

## Risks / Trade-offs

- Broad renames can break imports on case-sensitive deployments → use full reference search and run frontend/backend checks.
- JSON/API field renames can break clients → preserve public contract or provide explicit aliases/mappers.
- SQL identifier renames can require migrations → avoid changing persisted database schema unless mapping/migration impact is understood.
- Next.js route folder renames can change URLs → keep route segments stable unless explicitly approved.
- Existing pending OpenSpec change for Vietnamese comment conversion may overlap docs/comments → avoid overwriting unrelated in-progress changes.

## Migration Plan

1. Create and approve this OpenSpec change before implementation.
2. During `/opsx:apply`, generate a naming inventory report and candidate rename list.
3. Apply renames in small batches by layer: docs/conventions, frontend symbols, backend symbols, SQL/API mappings.
4. Run validation after each high-risk batch.
5. Final validation: `git diff --check`, frontend build/lint/typecheck where available, backend import/syntax checks, and targeted grep for old names.
6. Archive the change only after validation passes or remaining caveats are documented.

Rollback strategy: because no business logic should change, revert the refactor commit or batch-specific file changes if validation reveals broken references.

## Open Questions

- Should persisted database table/column names be physically renamed via migrations if they violate `snake_case`, or should only code aliases/mappings be normalized when DB changes are risky?
- Should public API JSON keys remain backward compatible even if they violate the frontend `camelCase` rule, or is a breaking API key migration acceptable?
- Should Next.js route folder names such as `forgot-password` remain kebab-case for URL stability, or be exempted explicitly in `docs/ai_conventions.md`?
