## 1. Discovery and Classification

- [x] 1.1 Inventory project-owned files and exclude dependencies, generated output, lockfiles, secrets, binary assets, and archived OpenSpec changes
- [x] 1.2 Scan English technical identifiers across frontend TypeScript/React, backend Python, SQL, docs, config, DTOs, schemas, models, API mappings, imports, exports, and paths
- [x] 1.3 Classify each candidate as safe rename, cross-layer mapping, framework-required exemption, external contract, or risky database migration
- [x] 1.4 Produce a batch plan for renames ordered by dependency and risk

## 2. Convention Documentation

- [x] 2.1 Create `docs/ai_conventions.md` with official naming convention rules
- [x] 2.2 Add AI generation rules that instruct future agents to use only the approved style per category
- [x] 2.3 Add correct/incorrect examples for TypeScript, React, Python, SQL, environment variables, DTO/API mappings, and file names
- [x] 2.4 Add refactor safety rules covering imports, exports, serialized API fields, database identifiers, migrations, routes, generated files, and validation

## 3. Frontend Normalization

- [x] 3.1 Normalize English variable/function/hook names to `camelCase` where project-owned and safe
- [x] 3.2 Normalize React component/class/type/interface names to `PascalCase` where project-owned and safe
- [x] 3.3 Rename frontend files/folders/import/export references when convention requires it and route stability permits it
- [x] 3.4 Update frontend DTO/API adapter mappings where backend or database fields remain `snake_case`

## 4. Backend Normalization

- [x] 4.1 Normalize Python variables/functions to the approved internal style where applicable without breaking framework hooks
- [x] 4.2 Ensure Python files/modules remain `snake_case` and update imports/references for any renamed modules
- [x] 4.3 Normalize classes/models/schemas to `PascalCase` where project-owned and safe
- [x] 4.4 Update FastAPI/Pydantic/ORM aliases or serializers for API/database compatibility

## 5. SQL and Database Mapping

- [x] 5.1 Scan SQL schema and migrations for non-`snake_case` English table/column/index/function identifiers
- [x] 5.2 Normalize safe SQL aliases and project-owned query identifiers without changing persisted schema unexpectedly
- [x] 5.3 Document or implement migration-safe handling for any persisted database identifier that requires physical rename
- [x] 5.4 Verify SQL references in backend code and docs after any SQL-related rename

## 6. Safety Review and Validation

- [x] 6.1 Run full-reference searches for old names and mixed naming violations after each rename batch
- [x] 6.2 Run `git diff --check`
- [x] 6.3 Run frontend validation available in the project, such as lint/typecheck/build
- [x] 6.4 Run backend validation available in the project, such as syntax/import checks or tests
- [x] 6.5 Summarize changed files, exceptions, validation results, and any deferred risky database/API contract changes
