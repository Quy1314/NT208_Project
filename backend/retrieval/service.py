"""Retrieval: index lore chunk, semantic search và context pack."""

from __future__ import annotations

import os
import uuid
import abc
from datetime import datetime
from typing import Any
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from lore.db_models import CanonScope, LoreChunk, LORE_EMBEDDING_DIM
from retrieval.chunker import chunk_text, chunk_text_rag
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


class VectorStoreInterface(abc.ABC):
    @abc.abstractmethod
    def add_chunks(
        self,
        db: Session,
        scope_id: uuid.UUID,
        chunks: list[str],
        metadata_list: list[dict[str, Any]],
        hf_api_key: str | None
    ) -> int:
        pass

    @abc.abstractmethod
    def search(
        self,
        db: Session,
        scope_id: uuid.UUID,
        query: str,
        hf_api_key: str | None,
        top_k: int = 6
    ) -> list[dict[str, Any]]:
        pass


class LocalDBVectorStore(VectorStoreInterface):
    def add_chunks(
        self,
        db: Session,
        scope_id: uuid.UUID,
        chunks: list[str],
        metadata_list: list[dict[str, Any]],
        hf_api_key: str | None
    ) -> int:
        if not chunks:
            return 0
        vectors = embed_texts(chunks, hf_api_key)
        
        max_idx_row = db.query(LoreChunk.chunk_index).filter(LoreChunk.scope_id == scope_id).order_by(LoreChunk.chunk_index.desc()).first()
        start_idx = (max_idx_row[0] + 1) if max_idx_row else 0

        for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
            meta = metadata_list[i] if i < len(metadata_list) else {}
            db.add(
                LoreChunk(
                    scope_id=scope_id,
                    chapter_no=meta.get("chapter_no"),
                    chunk_index=start_idx + i,
                    text=chunk,
                    embedding=vec,
                    entity_ids=meta,  # Storing full metadata dictionary in JSONB column
                    source=meta.get("source", "story_segment"),
                )
            )
        db.commit()
        return len(chunks)

    def search(
        self,
        db: Session,
        scope_id: uuid.UUID,
        query: str,
        hf_api_key: str | None,
        top_k: int = 6
    ) -> list[dict[str, Any]]:
        qvec = embed_query(query, hf_api_key)
        
        use_pgvector = os.getenv("USE_PGVECTOR_SEARCH", "true").lower() == "true"
        is_prod = os.getenv("ENV") == "production"
        
        if use_pgvector:
            try:
                return _perform_pgvector_search(db, scope_id, qvec, top_k)
            except Exception as e:
                print(f"[WARN] pgvector search failed: {e}")
                if is_prod:
                    raise RuntimeError("pgvector search failed on production. Fallback to in-memory search is disabled.") from e
                print("[WARN] Falling back to in-memory Python vector similarity search.")

        # Fallback Python in-memory search (only for development)
        rows = (
            db.query(LoreChunk)
            .filter(LoreChunk.scope_id == scope_id, LoreChunk.embedding.isnot(None))
            .limit(500)
            .all()
        )
        scored: list[dict[str, Any]] = []
        for row in rows:
            vec = [float(x) for x in (row.embedding or [])]
            if len(vec) != len(qvec):
                continue
            scored.append({
                "text": row.text,
                "score": _cosine_sim(qvec, vec),
                "metadata": row.entity_ids
            })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

def _perform_pgvector_search(db: Session, scope_id: uuid.UUID, qvec: list[float], limit: int) -> list[dict[str, Any]]:
    # Convert qvec to pgvector format '[val1,val2,...]'
    qvec_str = "[" + ",".join(str(x) for x in qvec) + "]"
    sql = text("""
        SELECT text, entity_ids, (1.0 - (embedding <=> :qvec::vector)) AS score
        FROM lore_chunk
        WHERE scope_id = :scope_id AND embedding IS NOT NULL
        ORDER BY embedding <=> :qvec::vector
        LIMIT :limit
    """)
    res = db.execute(sql, {"scope_id": scope_id, "qvec": qvec_str, "limit": limit})
    results = []
    for row in res:
        results.append({
            "text": row[0],
            "metadata": row[1] or {},
            "score": float(row[2]) if row[2] is not None else 0.0
        })
    return results


vector_store: VectorStoreInterface = LocalDBVectorStore()


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
    """Chia chunk và embed prose của project vào lore_chunk."""
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
    """Trả về chunk_text và điểm similarity bằng cosine."""
    qvec = embed_query(query, hf_api_key)
    
    use_pgvector = os.getenv("USE_PGVECTOR_SEARCH", "true").lower() == "true"
    is_prod = os.getenv("ENV") == "production"
    
    if use_pgvector:
        try:
            results = _perform_pgvector_search(db, scope_id, qvec, top_k)
            return [(r["text"], r["score"]) for r in results]
        except Exception as e:
            print(f"[WARN] pgvector search failed: {e}")
            if is_prod:
                raise RuntimeError("pgvector search failed on production. Fallback to in-memory search is disabled.") from e
            print("[WARN] Falling back to in-memory Python vector similarity search.")

    # Fallback Python in-memory search (only for development)
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


def detect_characters_in_text(db: Session, scope_id: uuid.UUID, text: str) -> list[str]:
    from lore.db_models import CanonCharacter
    try:
        characters = db.query(CanonCharacter).filter(CanonCharacter.scope_id == scope_id).all()
        detected = []
        text_lower = text.lower()
        for char in characters:
            slug = (char.slug or "").lower()
            name = (char.display_name or "").lower()
            if (slug and slug in text_lower) or (name and name in text_lower):
                detected.append(char.display_name)
        return list(set(detected))
    except Exception as e:
        print(f"[WARN] Error detecting characters: {e}")
        return []


def append_chunks_for_new_segment(
    db: Session,
    scope_id: uuid.UUID,
    segment: str,
    hf_api_key: str | None,
    *,
    role: str = "assistant",
    message_id: uuid.UUID | None = None,
    chapter_no: int | None = None,
    source: str = "story_segment"
) -> int:
    """Sau khi viết tiếp truyện, chỉ embed segment mới và append row với metadata đầy đủ."""
    cleaned = (segment or "").strip()
    if not cleaned or len(cleaned) < 20 or cleaned == "Waiting for LLM generation...":
        return 0

    pieces = chunk_text_rag(cleaned, max_chars=3000, overlap=400)
    if not pieces:
        return 0

    character_names = detect_characters_in_text(db, scope_id, cleaned)
    
    metadata_list = []
    for _ in pieces:
        metadata_list.append({
            "role": role,
            "character_names": character_names,
            "message_id": str(message_id) if message_id else None,
            "created_at": datetime.utcnow().isoformat(),
            "chapter_no": chapter_no,
            "source": source
        })

    try:
        return vector_store.add_chunks(db, scope_id, pieces, metadata_list, hf_api_key)
    except Exception as e:
        print(f"[ERROR] failed to add chunks to vector store: {e}")
        return 0
