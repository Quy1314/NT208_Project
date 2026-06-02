"""Chia prose dài thành chunk để embedding và retrieval."""

from __future__ import annotations


def chunk_text(text: str, max_chars: int = 900, overlap: int = 120) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + max_chars, n)
        piece = text[start:end]
        chunks.append(piece.strip())
        if end >= n:
            break
        start = max(0, end - overlap)
    return [c for c in chunks if c]


def chunk_text_rag(text: str, max_chars: int = 3000, overlap: int = 400) -> list[str]:
    """Chia prose dài thành chunk lớn hơn để phục vụ RAG (khoảng 500-1000 tokens)."""
    return chunk_text(text, max_chars=max_chars, overlap=overlap)
