"""Story context pack: structured canon + semantic lore chunks (+ optional tone tail)."""

from __future__ import annotations

import os
import uuid

from sqlalchemy.orm import Session

from retrieval.service import ensure_canon_scope, semantic_search_chunks
from services.canon_queries import format_structured_context_pack


def build_story_context_pack(
    db: Session,
    project_id: uuid.UUID,
    instruction: str,
    hf_api_key: str | None,
    *,
    focus_character_slug: str | None = None,
    prose_tail_chars: int | None = None,
    project_content: str = "",
) -> str:
    """
    Primary context for story generation — NOT a sliding window of arbitrary length.
    Optional small prose tail from latest chapter for tone (CANON_PROSE_TAIL_CHARS, default 0).
    """
    scope = ensure_canon_scope(db, project_id)
    structured = format_structured_context_pack(db, scope.id, focus_character_slug)

    sem_lines: list[str] = []
    try:
        hits = semantic_search_chunks(db, scope.id, instruction, hf_api_key, top_k=6)
        for txt, score in hits:
            sem_lines.append(f"(sim={score:.3f}) {txt[:1200]}")
    except Exception as e:
        sem_lines.append(f"(semantic retrieval unavailable: {e})")

    sem_block = "=== SEMANTIC LORE SNIPPETS ===\n" + ("\n---\n".join(sem_lines) if sem_lines else "(none)")

    tail_n = prose_tail_chars
    if tail_n is None:
        tail_n = int(os.getenv("CANON_PROSE_TAIL_CHARS", "0"))
    tone = ""
    if tail_n > 0 and project_content:
        tone = "\n=== RECENT PROSE TAIL (tone only; facts from structured blocks win) ===\n" + project_content[-tail_n:]

    return structured + "\n\n" + sem_block + tone
