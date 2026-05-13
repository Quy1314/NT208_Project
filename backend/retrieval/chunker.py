"""Split long prose into chunks for embedding / retrieval."""

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
