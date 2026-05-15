## 1. Discovery and Scope

- [x] 1.1 Enumerate project-owned text files that may contain English comments
- [x] 1.2 Exclude unsafe paths such as `.env`, dependencies, build outputs, lockfiles, binary assets, generated files, and archived OpenSpec changes
- [x] 1.3 Categorize candidate files by comment syntax and risk level

## 2. Comment Conversion

- [x] 2.1 Convert English SQL comments in schema and migration files into concise Vietnamese summaries
- [x] 2.2 Convert English Python comments/doc-comments in backend-owned source files into concise Vietnamese summaries
- [x] 2.3 Convert English frontend JavaScript/TypeScript/CSS comments into concise Vietnamese summaries where applicable
- [x] 2.4 Preserve TODO, FIXME, WARNING, NOTE, migration caveat, and operational warning intent during conversion

## 3. Safety Review

- [x] 3.1 Review diffs to confirm non-comment code, SQL statements, identifiers, config values, and runtime strings are unchanged
- [x] 3.2 Verify skipped files match the exclusion policy from the design/spec
- [x] 3.3 Check that translated comments remain short, natural, and technically accurate in Vietnamese

## 4. Validation

- [x] 4.1 Run lightweight syntax or test validation for touched code paths where practical (`git diff --check`)
- [x] 4.2 Run OpenSpec status/validation for `convert-comments-to-vietnamese-summaries`
- [x] 4.3 Summarize converted file groups, skipped areas, and any caveats before archive
