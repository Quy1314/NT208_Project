## Why

The project currently mixes naming styles across TypeScript, React, Python, SQL, schemas, DTOs, files, and generated documentation. A strict naming convention reduces cognitive load, prevents future AI-generated drift, and makes cross-layer API/database mappings explicit and safer to maintain.

## What Changes

- Introduce one official project naming convention:
  - Variables/functions: `camelCase`
  - Classes/React Components: `PascalCase`
  - Database objects, SQL identifiers, Python files/modules: `snake_case`
  - Constants/environment variables: `UPPER_SNAKE_CASE`
- Scan project-owned source, SQL, docs, and configuration files for English identifiers that violate the selected conventions.
- Normalize names by renaming files/folders/imports/exports/references together to avoid broken references.
- Update DTO/schema/model/API mapping where names cross language or database boundaries.
- Create `docs/ai_conventions.md` with the official naming rules, AI code-generation rules, correct/incorrect examples, and refactor safety rules.
- Preserve business logic and user-facing runtime behavior.
- Apply only to English technical names; Vietnamese comments/content are not a rename target.

## Capabilities

### New Capabilities
- `project-naming-conventions`: Defines the official naming standards and refactor safety requirements for code, database, APIs, DTOs, files, constants, and AI-generated changes.

### Modified Capabilities
- None.

## Impact

- Affected files: project-owned backend Python modules, frontend TypeScript/React modules, SQL schema/migration files, API schemas/DTOs/models, docs, and import/export/reference paths.
- New docs: `docs/ai_conventions.md`.
- APIs/database: may require explicit alias/mapping updates where external API JSON, SQL columns, ORM fields, and frontend types differ by convention.
- Dependencies: no new runtime dependency is intended.
- Risk: broad rename operations can break imports, serialized API contracts, SQL references, migrations, or case-sensitive paths. Implementation must use staged scans, targeted renames, full-reference search, and build/test validation.
