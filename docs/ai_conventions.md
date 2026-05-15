# AI Coding Conventions

This document is the official naming and refactor safety guide for this project. Human developers and AI agents must follow it when creating, editing, or refactoring code.

## Official Naming Convention

| Category | Required style | Correct | Incorrect |
| --- | --- | --- | --- |
| Variable | `camelCase` | `projectId`, `selectedTeam` | `project_id`, `SelectedTeam` |
| Function | `camelCase` | `fetchProjects`, `handleSubmit` | `fetch_projects`, `HandleSubmit` |
| React hook | `camelCase` starting with `use` | `useProjectState` | `UseProjectState`, `use_project_state` |
| Class | `PascalCase` | `ProjectService` | `projectService`, `project_service` |
| React component | `PascalCase` | `ProjectStage` | `projectStage`, `project_stage` |
| Type/interface/schema class | `PascalCase` | `ProjectResponse` | `projectResponse`, `project_response` |
| Python file/module | `snake_case` | `audio_pipeline.py` | `AudioPipeline.py`, `audioPipeline.py` |
| Database table/column | `snake_case` | `project_assets`, `created_at` | `projectAssets`, `CreatedAt` |
| SQL alias/index/function | `snake_case` | `idx_projects_owner_id` | `idxProjectsOwnerId` |
| Constant | `UPPER_SNAKE_CASE` | `API_BASE_URL` | `apiBaseUrl`, `ApiBaseUrl` |
| Environment variable | `UPPER_SNAKE_CASE` | `NEXT_PUBLIC_API_URL` | `nextPublicApiUrl` |

## Language-Specific Rules

### TypeScript and React

- Use `camelCase` for variables, functions, methods, event handlers, and non-component helpers.
- Use `PascalCase` for React components, classes, interfaces, type aliases, enums, and schema-like DTO types.
- Use `UPPER_SNAKE_CASE` for true constants and environment variable names.
- Component filenames should match the exported component in `PascalCase`, for example `ProjectStage.tsx`.
- Utility filenames may use `camelCase` when they export regular functions, for example `exportProject.ts`.
- Next.js framework filenames such as `page.tsx`, `layout.tsx`, `middleware.ts`, and route folders are framework/URL conventions and are exempt unless a route migration is explicitly approved.

```ts
// Correct
const selectedProjectId = project.id;
function fetchProjects() {}
type ProjectResponse = { id: string };
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
export function ProjectStage() {}

// Incorrect
const selected_project_id = project.id;
function FetchProjects() {}
type project_response = { id: string };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
export function project_stage() {}
```

### Python

- Python files and modules must use `snake_case`.
- Python variables and functions should remain idiomatic `snake_case` unless the symbol is an adapter for frontend/API camelCase input.
- Python classes and Pydantic/ORM models must use `PascalCase`.
- Constants and environment variable names must use `UPPER_SNAKE_CASE`.
- Use aliases/serializers when mapping between Python `snake_case` and API/client `camelCase`.

```py
# Correct
API_TIMEOUT_SECONDS = 30
project_id = request.project_id

def create_project():
    pass

class ProjectResponse(BaseModel):
    pass

# Incorrect
apiTimeoutSeconds = 30
projectId = request.project_id

def CreateProject():
    pass

class project_response(BaseModel):
    pass
```

### SQL and Database

- Tables, columns, indexes, functions, triggers, and SQL aliases must use `snake_case`.
- Do not rename persisted database identifiers casually. Physical DB renames require migration planning, reference checks, rollback notes, and data safety review.
- If frontend/client code needs `camelCase`, map explicitly at the API or adapter layer instead of changing database naming.

```sql
-- Correct
CREATE TABLE project_assets (
  project_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Incorrect
CREATE TABLE projectAssets (
  projectId UUID NOT NULL,
  CreatedAt TIMESTAMPTZ NOT NULL
);
```

## DTO, Schema, Model, and API Mapping Rules

Different layers can use different naming styles when required by ecosystem conventions. The mapping must be explicit.

- Frontend TypeScript DTO properties should use `camelCase` internally.
- Backend Python models may use `snake_case` internally.
- Database columns must use `snake_case`.
- Public API JSON keys must remain backward compatible unless a breaking change is approved.
- Use adapter functions, Pydantic aliases, ORM mappings, or SQL aliases to bridge naming differences.

```ts
// Correct frontend adapter
const project = {
  projectId: response.project_id,
  createdAt: response.created_at,
};
```

```py
# Correct backend alias example
class ProjectResponse(BaseModel):
    project_id: str = Field(alias="projectId")
```

## AI Generation Rules

AI agents must:

1. Determine the semantic category before naming anything.
2. Use only the approved style for that category.
3. Preserve framework-required names and external API names.
4. Prefer explicit mapping over breaking public contracts.
5. Avoid introducing mixed naming styles in new files.
6. Update imports, exports, tests, docs, and references in the same change when renaming.
7. Run available validation after refactors.
8. Document any exception with the reason and owner layer.

## Refactor Safety Rules

Before renaming:

- Search all references to the old name.
- Classify the name as internal, cross-layer, external contract, generated, framework-required, or database-persisted.
- Avoid broad regex replacement across strings unless each match is reviewed.
- Check whether a file rename is case-only; use a staged rename if needed on Windows.

During renaming:

- Rename files/folders together with imports and exports.
- Keep business logic, runtime text, SQL data values, and user-facing UI strings unchanged.
- Preserve API compatibility with aliases or adapter functions.
- Do not edit secrets, lockfiles, dependency folders, generated build output, binary assets, or archived OpenSpec changes.

After renaming:

- Run `git diff --check`.
- Run available frontend validation such as lint, typecheck, or build.
- Run available backend validation such as syntax/import checks or tests.
- Search for obsolete names and mixed-style leftovers.
- Summarize any deliberate exceptions.

## Approved Exceptions

- Next.js route folders may remain URL-style such as `forgot-password` to preserve routes.
- Next.js framework files may remain `page.tsx`, `layout.tsx`, and `middleware.ts`.
- Third-party API names, protocol fields, and framework hook names must remain as required by their owners.
- Persisted database identifiers require migration approval before physical rename.
