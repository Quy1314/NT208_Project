"""Retrieval: index lore chunks + semantic search + context packs."""

from __future__ import annotations

import os
import uuid

from sqlalchemy import delete
from sqlalchemy.orm import Session

from lore.db_models import CanonScope, LoreChunk, LORE_EMBEDDING_DIM
from retrieval.chunker import chunk_text
from retrieval.embedder import embed_query, embed_texts

TOP_K_DEFAULT = 8


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def get_scope_for_project(db: Session, project_id: uuid.UUID) -> CanonScope | None:
    return db.query(CanonScope).filter(CanonScope.project_id == project_id).first()


def ensure_canon_scope(db: Session, project_id: uuid.UUID) -> CanonScope:
    row = get_scope_for_project(db, project_id)
    if row:
        return row
    row = CanonScope(project_id=project_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def reindex_project_prose(
    db: Session,
    scope_id: uuid.UUID,
    full_text: str,
    hf_api_key: str | None,
    *,
    replace: bool = True,
    source: str = "project_content",
) -> int:
    """Chunk + embed project prose into lore_chunk."""
    if replace:
        db.execute(delete(LoreChunk).where(LoreChunk.scope_id == scope_id, LoreChunk.source == source))
        db.commit()

    pieces = chunk_text(full_text or "", max_chars=int(os.getenv("CANON_CHUNK_CHARS", "900")))
    if not pieces:
        return 0

    vectors = embed_texts(pieces, hf_api_key)
    if len(vectors) != len(pieces):
        raise RuntimeError("Embedding batch size mismatch.")

    for idx, (chunk, vec) in enumerate(zip(pieces, vectors)):
        if len(vec) != LORE_EMBEDDING_DIM:
            raise RuntimeError(f"Bad embedding dim {len(vec)} expected {LORE_EMBEDDING_DIM}")
        lc = LoreChunk(
            scope_id=scope_id,
            chapter_no=None,
            chunk_index=idx,
            text=chunk,
            embedding=vec,
            entity_ids=[],
            source=source,
        )
        db.add(lc)
    db.commit()
    return len(pieces)


def semantic_search_chunks(
    db: Session,
    scope_id: uuid.UUID,
    query: str,
    hf_api_key: str | None,
    top_k: int = TOP_K_DEFAULT,
) -> list[tuple[str, float]]:
    """Return (chunk_text, similarity score). Uses Python cosine vs embedded chunks."""
    qvec = embed_query(query, hf_api_key)
    rows = (
        db.query(LoreChunk)
        .filter(LoreChunk.scope_id == scope_id, LoreChunk.embedding.isnot(None))
        .limit(500)
        .all()
    )
    scored: list[tuple[str, float]] = []
    for row in rows:
        vec = [float(x) for x in (row.embedding or [])]
        if len(vec) != len(qvec):
            continue
        scored.append((row.text, _cosine_sim(qvec, vec)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def append_chunks_for_new_segment(
    db: Session,
    scope_id: uuid.UUID,
    segment: str,
    hf_api_key: str | None,
) -> int:
    """After story continuation, embed only the new segment (append rows)."""
    pieces = chunk_text(segment or "", max_chars=int(os.getenv("CANON_CHUNK_CHARS", "900")))
    if not pieces:
        return 0
    max_idx_row = db.query(LoreChunk.chunk_index).filter(LoreChunk.scope_id == scope_id).order_by(LoreChunk.chunk_index.desc()).first()
    start_idx = (max_idx_row[0] + 1) if max_idx_row else 0
    vectors = embed_texts(pieces, hf_api_key)
    for i, (chunk, vec) in enumerate(zip(pieces, vectors)):
        db.add(
            LoreChunk(
                scope_id=scope_id,
                chapter_no=None,
                chunk_index=start_idx + i,
                text=chunk,
                embedding=vec,
                entity_ids=[],
                source="story_segment",
            )
        )
    db.commit()
    return len(pieces)
