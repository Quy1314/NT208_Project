## ADDED Requirements

### Requirement: Official naming conventions
The project SHALL define exactly one naming style per English technical identifier category and SHALL document those rules in `docs/ai_conventions.md`.

#### Scenario: AI convention document exists
- **WHEN** the change is implemented
- **THEN** `docs/ai_conventions.md` contains official naming rules for variables/functions, classes/React components, database/table/column/python files, constants/environment variables, AI generation rules, examples, anti-examples, and refactor safety rules

#### Scenario: Identifier category has one style
- **WHEN** a project-owned English technical identifier is created or renamed
- **THEN** variables/functions use `camelCase`, classes/React components use `PascalCase`, database/table/column/python files use `snake_case`, and constants/environment variables use `UPPER_SNAKE_CASE`

### Requirement: Safe project-wide naming normalization
The project SHALL scan and normalize project-owned English technical names without changing business logic or runtime behavior.

#### Scenario: References remain intact after rename
- **WHEN** a file, folder, import, export, symbol, DTO field, schema field, model field, API mapping, or SQL reference is renamed
- **THEN** all related references are updated so builds/tests do not fail due to missing names or broken paths

#### Scenario: External and framework names are protected
- **WHEN** a candidate name belongs to a third-party API, framework-required convention, generated file, dependency, public URL route segment, secret, lockfile, or persisted external contract
- **THEN** the implementation either preserves it or documents an explicit mapping/exception instead of blindly renaming it

### Requirement: Cross-layer DTO API database mappings
The project SHALL keep cross-layer mappings explicit when different layers require different naming styles.

#### Scenario: Frontend camelCase maps to backend or database snake_case
- **WHEN** a frontend DTO or UI model uses `camelCase` but backend, SQL, or Python models use `snake_case`
- **THEN** the code provides an explicit serializer, alias, adapter, ORM mapping, SQL alias, or conversion function so external behavior remains stable

#### Scenario: Public API compatibility is preserved
- **WHEN** an API field name is part of an existing public contract
- **THEN** the refactor preserves backward compatibility or documents the intentional breaking change before implementation

### Requirement: Validation after refactor
The project SHALL validate that naming normalization did not introduce broken references or syntax errors.

#### Scenario: Automated validation runs
- **WHEN** implementation finishes
- **THEN** the project runs practical validation including `git diff --check`, frontend validation, backend validation, and targeted searches for obsolete names or mixed naming violations

#### Scenario: Validation caveats are reported
- **WHEN** any validation command cannot run or a convention exception remains
- **THEN** the final summary documents the skipped command, reason, risk, and follow-up action
