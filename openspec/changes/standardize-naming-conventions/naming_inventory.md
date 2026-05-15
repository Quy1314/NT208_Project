# Naming Inventory - standardize-naming-conventions

## Scope

Project-owned source and docs were inventoried under:

- `backend/**/*.py`
- `backend/migrations/**/*.sql`
- `database_schema.sql`
- `frontend/src/**/*.{ts,tsx,css}`
- selected config/docs files (`*.json`, `*.md`, `*.toml`, `*.yaml`, `*.yml`)

## Exclusions

Excluded from rename/edit scans unless explicitly reviewed:

- `.git/`
- `node_modules/`
- `.next/`
- `__pycache__/`
- lockfiles such as `frontend/package-lock.json`
- secrets such as `backend/.env` and `frontend/.env.local`
- binaries/assets such as `*.png`, `*.mp4`, `*.ico`, `*.db`, `*.svg`
- archived OpenSpec changes under `openspec/changes/archive/`
- generated cache files such as `tsconfig.tsbuildinfo`

## Naming Rule Summary

- Variables/functions/hooks: `camelCase`
- Classes/React components/types/interfaces: `PascalCase`
- Database/table/column/python file/module names: `snake_case`
- Constants/env vars: `UPPER_SNAKE_CASE`

## Initial Classification

### Safe or likely safe to normalize

- Project-owned TypeScript utility functions and local variables that do not cross API/DB boundaries.
- React component filenames under `frontend/src/components/**` when import references are updated together.
- Python classes/functions that are project-owned and not framework hooks or external API names.
- Documentation examples and AI convention guidance.

### Cross-layer mapping required

- Frontend DTO/model fields that currently mirror backend or SQL `snake_case` names.
- FastAPI/Pydantic request/response models exposing JSON fields.
- SQL query aliases consumed by Python or frontend code.

### Framework or external-contract exemptions

- Next.js route folders and `page.tsx`/`layout.tsx` filenames: route stability and framework convention.
- React props named by third-party libraries.
- FastAPI dependency names and OAuth2 form field names where protocol-defined.
- Environment variable names: already expected as `UPPER_SNAKE_CASE`.
- Database persisted table/column names unless migration impact is explicitly handled.

### Risky candidates

- Physical database identifier renames in migrations/schema.
- Public API JSON key changes.
- Case-only file renames on Windows that may fail on case-sensitive deployment if not staged carefully.

## Batch Plan

1. Add `docs/ai_conventions.md` first.
2. Normalize safe frontend internal symbols and component filenames/imports.
3. Normalize backend internal symbols and Python class names.
4. Review DTO/API/database crossings and add explicit adapters/aliases instead of breaking contracts.
5. Review SQL names and document migration-safe handling before physical DB renames.
6. Run reference searches and validation.
