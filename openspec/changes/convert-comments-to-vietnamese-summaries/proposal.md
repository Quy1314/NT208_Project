## Why

The project contains English comments across source code, SQL migrations, configuration-adjacent files, and documentation-like inline notes. Converting those comments into concise Vietnamese summaries improves maintainability for the current team while preserving runtime behavior and technical intent.

## What Changes

- Convert English comments in project-owned files into short, natural Vietnamese summaries.
- Preserve code, SQL statements, public API names, environment variables, literals, and generated/vendor content unchanged.
- Keep technically important warnings, migration caveats, and operational notes accurate after translation.
- Avoid translating user-facing UI strings unless they are clearly comments or documentation notes.
- No breaking changes are intended.

## Capabilities

### New Capabilities
- `vietnamese-comment-summaries`: Defines how project comments should be converted from English into concise Vietnamese summaries without changing behavior.

### Modified Capabilities
- None.

## Impact

- Affected files: project-owned code, SQL scripts/migrations, config templates, and documentation-style inline comments containing English comments.
- Excluded files: generated artifacts, dependency folders, binary assets, lockfiles, secrets such as `.env`, and archived OpenSpec changes unless explicitly needed.
- APIs/dependencies: no runtime API or dependency changes.
- Risk: accidental behavior changes if string literals, SQL identifiers, or user-visible text are modified; implementation must use careful review and targeted edits.
