"""Context pack: canon có cấu trúc, lore semantic và tone tùy chọn."""

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


def build_context_messages(
    db: Session,
    project_id: uuid.UUID,
    system_prompt: str,
    title: str,
    latest_user_message: str,
    language: str,
    hf_api_key: str | None,
    n_recent: int = 12,
    top_k: int = 6,
    canon_context_pack: str | None = None
) -> list[dict[str, str]]:
    """Xây dựng danh sách messages được tối ưu hóa ngữ cảnh (sliding window + RAG)."""
    import models
    from retrieval.service import ensure_canon_scope, vector_store

    # 1. Lấy N message gần nhất từ DB (mỗi ProjectContextEntry chứa 1 user prompt và 1 assistant content = 2 messages)
    limit_turns = n_recent // 2
    entries = (
        db.query(models.ProjectContextEntry)
        .filter(models.ProjectContextEntry.project_id == project_id)
        .order_by(models.ProjectContextEntry.created_at.desc())
        .limit(limit_turns)
        .all()
    )
    entries = list(reversed(entries))

    # 2. Vector search lấy topK chunks liên quan đến query
    scope = ensure_canon_scope(db, project_id)
    retrieved_chunks = []
    try:
        hits = vector_store.search(db, scope.id, latest_user_message, hf_api_key, top_k=top_k)
        for hit in hits:
            txt = hit.get("text", "")
            if txt.strip():
                retrieved_chunks.append(txt.strip())
    except Exception as e:
        print(f"[WARN] build_context_messages semantic search failed: {e}")

    retrieved_context_text = "\n---\n".join(retrieved_chunks) if retrieved_chunks else "(none)"

    # 3. Format recent history messages
    recent_messages = []
    for entry in entries:
        recent_messages.append({"role": "user", "content": entry.prompt})
        recent_messages.append({"role": "assistant", "content": entry.generated_content})

    # 4. Build final messages payload
    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Thêm canon context pack nếu có
    if canon_context_pack and canon_context_pack.strip():
        messages.append({
            "role": "system",
            "content": f"Structured Universe Lore & Bible:\n{canon_context_pack.strip()}"
        })

    # Thêm RAG context
    messages.append({
        "role": "system",
        "content": f"Relevant long-term context:\n{retrieved_context_text}"
    })

    # Thêm recent messages
    messages.extend(recent_messages)

    # Thêm latest user query
    language_label = "vietnamese" if language == "vietnamese" else "english"
    if language_label == "english":
        user_content = (
            f"Write the next part of this story in {language_label}.\n"
            f"Title: {title}\n"
            f"Current instruction: {latest_user_message}\n"
        )
    else:
        user_content = (
            f"Hãy viết tiếp nội dung truyện sáng tạo bằng {language_label}.\n"
            f"Tiêu đề: {title}\n"
            f"Yêu cầu hiện tại: {latest_user_message}\n"
            "Ràng buộc bắt buộc:\n"
            "- Chỉ dùng tiếng Việt, tuyệt đối không chèn câu tiếng Anh.\n"
            "- Nếu có thuật ngữ riêng (Pokemon, Team Rocket, Gym), giữ nguyên tên riêng, còn lại viết tiếng Việt tự nhiên.\n"
            "- Không mâu thuẫn với các sự kiện đã có ở chương trước.\n"
        )

    messages.append({"role": "user", "content": user_content})

    return messages
