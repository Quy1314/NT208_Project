## ADDED Requirements

### Requirement: Convert English comments to Vietnamese summaries
The project SHALL convert English comments in project-owned files into concise Vietnamese summaries while preserving their technical intent.

#### Scenario: English source comment is converted
- **WHEN** a project-owned source file contains an English-only comment
- **THEN** the comment is rewritten as a concise Vietnamese summary with the same technical intent

#### Scenario: Important caveat remains clear
- **WHEN** a comment contains a warning, migration caveat, TODO, FIXME, or operational constraint
- **THEN** the converted Vietnamese comment preserves the caveat and its urgency

### Requirement: Preserve runtime behavior
The conversion MUST NOT change executable behavior, public contracts, configuration values, identifiers, or user-facing text.

#### Scenario: Runtime strings are not translated
- **WHEN** English text appears inside executable string literals, SQL values, prompts, log messages, API responses, or UI labels
- **THEN** the text remains unchanged unless it is clearly part of a comment-only context

#### Scenario: Code and SQL semantics are unchanged
- **WHEN** comments are converted in source or SQL files
- **THEN** the non-comment tokens, statements, identifiers, formatting-sensitive syntax, and control flow remain behaviorally unchanged

### Requirement: Exclude unsafe or non-project content
The implementation SHALL avoid editing files where comment conversion is unsafe, noisy, generated, secret-bearing, or outside project ownership.

#### Scenario: Sensitive and generated files are skipped
- **WHEN** the repository contains `.env` files, dependency directories, build outputs, lockfiles, binary assets, generated files, or archived OpenSpec changes
- **THEN** those files are excluded from comment conversion by default

### Requirement: Maintain reviewable translation quality
The implementation SHALL keep translated comments short, natural, and technically accurate for Vietnamese maintainers.

#### Scenario: Technical nouns are preserved when clearer
- **WHEN** a comment references technical terms, identifiers, table names, API concepts, or migration commands
- **THEN** the Vietnamese summary preserves those terms when translating them would reduce clarity

#### Scenario: Diff review confirms comment-only changes
- **WHEN** implementation is complete
- **THEN** the resulting diff can be reviewed to confirm that changes are limited to comments and documentation-like inline notes
