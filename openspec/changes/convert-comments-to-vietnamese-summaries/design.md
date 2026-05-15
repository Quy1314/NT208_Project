## Context

The repository mixes English and Vietnamese comments in SQL, Python, JavaScript/TypeScript, CSS, and project documentation. The requested change is editorial but cross-cutting: it can touch many file types, and the main requirement is to preserve runtime behavior while making comments easier for Vietnamese maintainers to scan.

## Goals / Non-Goals

**Goals:**
- Convert English comments in project-owned files into concise Vietnamese summaries.
- Preserve the technical meaning of warnings, migration notes, SQL caveats, and architectural explanations.
- Keep changes behavior-preserving by editing comments only.
- Use a repeatable review process so literals, identifiers, API contracts, and user-facing strings are not accidentally translated.

**Non-Goals:**
- Translating executable strings, prompts, labels, UI copy, logs, error messages, API responses, or database values.
- Reformatting unrelated code or changing logic.
- Editing dependency/vendor/generated output, binary files, lockfiles, secrets, or archived OpenSpec changes.
- Making every comment long or fully literal; the target style is a useful Vietnamese summary.

## Decisions

1. **Comment-only conversion**
   - Decision: edit only recognized comment/doc-comment blocks and documentation-like inline notes.
   - Rationale: the user's request is about comments, not runtime localization.
   - Alternative considered: translate all English text. Rejected because it risks changing prompts, UI text, tests, and API behavior.

2. **Concise Vietnamese summaries instead of word-for-word translation**
   - Decision: translate intent into short, natural Vietnamese.
   - Rationale: summaries are easier to maintain and match the user's wording.
   - Alternative considered: literal translation. Rejected because it can be verbose and less useful for technical scanning.

3. **File scanning with exclusions**
   - Decision: scan common project-owned text files while excluding `.env`, dependency folders, build outputs, archives, binary assets, lockfiles, and generated content.
   - Rationale: broad enough to cover the project, constrained enough to avoid noisy or risky edits.
   - Alternative considered: only edit currently open SQL migration. Rejected because the request says "in project".

4. **Preserve structured comment semantics**
   - Decision: keep TODO/FIXME/WARNING/NOTE intent and important operational caveats visible in Vietnamese.
   - Rationale: those comments often drive future engineering decisions and should not lose urgency.

## Risks / Trade-offs

- **Risk: accidental translation of runtime strings** → Mitigation: use targeted edits and review diffs for changes outside comment syntax.
- **Risk: meaning loss in summarized comments** → Mitigation: preserve exact technical nouns, identifiers, and caveats when needed.
- **Risk: large diff size** → Mitigation: prioritize project-owned source and SQL files first; avoid archived/generated content.
- **Risk: mixed terminology** → Mitigation: keep established technical terms such as API, migration, schema, token, index, queue, and cache when clearer.

## Migration Plan

1. Enumerate project-owned files that contain English comments.
2. Exclude unsafe paths and generated/dependency artifacts.
3. Convert comments in small, reviewable groups by file type.
4. Verify diffs contain comment-only changes.
5. Run lightweight validation for syntax or tests where practical.

Rollback is simple because no runtime behavior should change: revert the comment-only diff if any issue is found.

## Open Questions

- Should archived OpenSpec changes be excluded from implementation? Recommended: exclude archives to avoid modifying historical records.
- Should Markdown documentation be included, or only source-code comments? Recommended: include only inline/source comments unless the user asks for full documentation translation.
