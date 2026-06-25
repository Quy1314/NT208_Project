from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session
from typing import Any, List, cast
from collections import Counter
import unicodedata
import os
import time
import json
import base64
import struct
import base64
import io
import re
import socket
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from PIL import Image as PILImage

import models
from database import get_db
from services.audio_pipeline import generate_audio_from_text, get_audio_upload_dir, to_mp3_if_possible
from services.storage import get_signed_url
from auth import get_current_user

from image_pipeline.pipeline import canon_engine_enabled, run_canon_image_pipeline
from retrieval.service import append_chunks_for_new_segment, ensure_canon_scope
from services.canon_queries import (
    ensure_default_visual_variant,
    get_character_by_slug,
    get_location_by_slug,
    project_has_canon_characters,
)
import lore.db_models as lore_models
from story_engine.context_pack import build_story_context_pack, build_context_messages

# Tạo Router cho group API liên quan đến Dự án, có prefix là /api/projects
router = APIRouter(prefix="/api/projects", tags=["Projects"])
FPT_TTS_MODEL = "fpt-ai-tts-v5"
VIENEU_TTS_MODEL = "vieneu-tts-v3"

PRESET_VOICES = frozenset({"Bình An", "Ngọc Linh", "Trúc Ly", "Mỹ Duyên",
                            "Xuân Vĩnh", "Thái Sơn", "Gia Bảo", "Đức Trí",
                            "Trọng Hữu", "Ngọc Lan"})


def _resolve_voice(db: Session, user_id: UUID, voice_name: str) -> tuple[str, str | None]:
    if voice_name in PRESET_VOICES:
        return voice_name, None
    profile = (
        db.query(models.VoiceProfile)
        .filter(models.VoiceProfile.user_id == user_id, models.VoiceProfile.name == voice_name)
        .first()
    )
    if profile:
        ref = profile.sample_url
        if ref and ref.startswith("private://"):
            bucket, fname = ref[10:].split("/", 1)
            ref = get_signed_url(bucket, fname) or ref
        return "Bình An", ref
    return "Bình An", None


def _ensure_wav_header(raw: bytes, sample_rate: int = 48000, channels: int = 1, bits: int = 16) -> bytes:
    """Wrap raw PCM bytes in WAV header if no RIFF header present."""
    if raw[:4] == b"RIFF":
        return raw
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    data_size = len(raw)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE", b"fmt ", 16, 1, channels,
        sample_rate, byte_rate, block_align, bits, b"data", data_size,
    )
    return header + raw
# Text-to-image qua Hugging Face Inference (router); khớp dropdown frontend.
HF_IMAGE_MODELS = frozenset(
    {
        "black-forest-labs/FLUX.1-schnell",
        "stabilityai/stable-diffusion-xl-base-1.0",
    }
)
HF_TRANSLATION_URLS_BY_MODE = {
    "vi-to-en": [
        "https://router.huggingface.co/hf-inference/models/Helsinki-NLP/opus-mt-vi-en",
        "https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-vi-en",
        "https://router.huggingface.co/hf-inference/models/google-t5/t5-base",
    ],
    "en-to-vi": [
        "https://router.huggingface.co/hf-inference/models/Helsinki-NLP/opus-mt-en-vi",
        "https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-en-vi",
        "https://router.huggingface.co/hf-inference/models/google-t5/t5-base",
    ],
}
MAX_TRANSLATE_CHUNK = 900
FINE_GRAIN_TRANSLATE_CHUNK = 280


def _extract_tts_text(prompt: str) -> str:
    cleaned = (prompt or "").strip()
    if not cleaned:
        return ""
    quote_pairs = [('"', '"'), ("“", "”"), ("'", "'")]
    for left, right in quote_pairs:
        if left in cleaned and right in cleaned:
            start = cleaned.find(left)
            end = cleaned.rfind(right)
            if end > start:
                quoted = cleaned[start + 1:end].strip()
                if quoted:
                    return quoted
    return cleaned


# Schema đã được chuyển qua models.py

def _project_uuid(project_id: str | UUID) -> UUID:
    if isinstance(project_id, UUID):
        return project_id
    try:
        return UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")


def _apply_persona_context(instruction: str, persona_context: str | None) -> str:
    """Attach user-selected character profiles to the generation instruction without storing them as project prose."""
    ctx = (persona_context or "").strip()
    base = (instruction or "").strip()
    if not ctx:
        return instruction
    # Keep requests bounded; the frontend already filters to mentioned characters, this is a final guard.
    if len(ctx) > 8000:
        ctx = ctx[:8000].rstrip() + "\n[persona context truncated]"
    if not base:
        return ctx
    return f"{ctx}\n\nUSER REQUEST:\n{base}"




_ENTITY_SCAN_MAX_TEXT = 24000
_ENTITY_STOPWORDS = {
    "AI", "API", "HTTP", "URL", "JSON", "JWT", "UUID", "Hugging Face", "Inference API",
    "Payment Required", "Forbidden", "Client Error", "For More Information", "Root", "Request ID",
    "Nội Dung", "Nội Dung AI", "User Prompt", "Chương", "Bước Đầu Tiên", "Hợp Tác Khoa Học",
    "Trở Về", "Lời Hứa", "Sự Hợp Tác", "Sự Phát Triển", "Một Tương Lai", "Đối Thoại",
    "Ngày", "Sau", "Khi", "Trong", "Trên", "Dưới", "Bên", "Từ", "Và", "Nhưng", "Ông", "Bà", "Cô", "Anh", "Em",
    "The", "This", "That", "Chapter", "Scene", "User", "Assistant", "Content", "Generated Content",
}
_LOCATION_KEYWORDS = {
    "sao", "hành tinh", "trái đất", "mars", "earth", "city", "thành phố", "vương quốc", "làng", "đảo", "rừng",
    "núi", "hang", "động", "tàu", "con tàu", "trạm", "căn cứ", "vũ trụ", "neo", "seoul", "quán", "cafe", "cà phê",
}
_LOCATION_CUE_RE = re.compile(
    r"(?:ở|tại|trên|trong|bên trong|đến|tới|về|quay lại|rời khỏi|from|at|in|inside|to|toward)\s+"
    r"([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\wÀ-ỹ'’-]*(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\wÀ-ỹ'’-]*){0,4})",
    re.UNICODE,
)
_PROPER_NOUN_RE = re.compile(
    r"\b([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\wÀ-ỹ'’-]*(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][\wÀ-ỹ'’-]*){0,3})\b",
    re.UNICODE,
)


def _strip_accents(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return value.replace("đ", "d").replace("Đ", "D")


def _canon_slug(value: str) -> str:
    ascii_value = _strip_accents(value).lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")
    return slug[:120] or "auto_entity"


def _normalize_entity_name(value: str) -> str:
    value = re.sub(r"[\*_`#>\[\](){}]", " ", value or "")
    value = re.sub(r"\s+", " ", value).strip(" .,:;!?\"'“”‘’-/\\")
    return value


def _entity_key(value: str) -> str:
    return re.sub(r"\s+", " ", _strip_accents(_normalize_entity_name(value)).lower()).strip()


def _looks_like_generation_error(text: str) -> bool:
    low = (text or "").lower()
    markers = [
        "huggin face bị gián đoạn",
        "hugging face bị gián đoạn",
        "payment required",
        "403 forbidden",
        "client error",
        "inference providers",
        "cannot access content",
    ]
    return any(marker in low for marker in markers)


def _clean_entity_scan_text(text: str) -> str:
    text = (text or "")[:_ENTITY_SCAN_MAX_TEXT]
    # Do not scan markdown headings because they produce many false-positive title-like names.
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if stripped.startswith("#") or stripped.startswith("[[USER_PROMPT]]"):
            continue
        if stripped.lower().startswith("nội dung ai đã tạo"):
            continue
        lines.append(line)
    return "\n".join(lines)


def _is_stop_entity(name: str) -> bool:
    clean = _normalize_entity_name(name)
    if not clean or len(clean) < 2:
        return True
    key = _entity_key(clean)
    stop_keys = {_entity_key(x) for x in _ENTITY_STOPWORDS}
    if key in stop_keys:
        return True
    words = clean.split()
    if len(words) > 5:
        return True
    if any(len(w) > 32 for w in words):
        return True
    if re.search(r"\d", clean):
        return True
    # Avoid common sentence-openers being treated as one-word names.
    if len(words) == 1 and key in {
        "sau", "khi", "trong", "tren", "duoi", "mot", "nhung", "va", "ong", "ba", "co", "anh", "em", "toi", "ho", "cac",
        "ngay", "luc", "neu", "vi", "boi", "tai", "day", "do", "nay", "kia", "chapter", "scene",
    }:
        return True
    return False


def _looks_like_location_name(name: str) -> bool:
    key = _entity_key(name)
    return any(keyword in key for keyword in _LOCATION_KEYWORDS)


def _count_entity_mentions(text: str, name: str) -> int:
    clean_name = re.escape(_normalize_entity_name(name))
    if not clean_name:
        return 0
    pattern = re.compile(rf"(?<![\wÀ-ỹ]){clean_name}(?![\wÀ-ỹ])", re.IGNORECASE | re.UNICODE)
    return len(pattern.findall(text))


def _extract_auto_canon_candidates(text: str) -> tuple[list[str], list[str]]:
    """Heuristic extraction for newly generated prose. Keeps false positives low and requires no extra AI API call."""
    if not text or _looks_like_generation_error(text):
        return [], []
    scan_text = _clean_entity_scan_text(text)
    if not scan_text.strip():
        return [], []

    location_counts: Counter[str] = Counter()
    for match in _LOCATION_CUE_RE.finditer(scan_text):
        name = _normalize_entity_name(match.group(1))
        if name and not _is_stop_entity(name):
            location_counts[name] += 2

    proper_counts: Counter[str] = Counter()
    for match in _PROPER_NOUN_RE.finditer(scan_text):
        name = _normalize_entity_name(match.group(1))
        if not name or _is_stop_entity(name):
            continue
        # Do not treat long title-ish phrases as entity names.
        if len(name.split()) >= 4 and not _looks_like_location_name(name):
            continue
        proper_counts[name] += 1

    for name, count in proper_counts.items():
        if _looks_like_location_name(name):
            location_counts[name] += count

    character_candidates: list[str] = []
    location_candidates: list[str] = []
    seen_chars: set[str] = set()
    seen_locs: set[str] = set()

    for name, count in proper_counts.most_common(20):
        if _looks_like_location_name(name):
            continue
        words = name.split()
        mentions = max(count, _count_entity_mentions(scan_text, name))
        # Multi-word names can appear once; single-word names need repetition to avoid random capitalized sentence starts.
        if len(words) >= 2 or mentions >= 2:
            key = _entity_key(name)
            if key not in seen_chars:
                seen_chars.add(key)
                character_candidates.append(name)
        if len(character_candidates) >= 8:
            break

    for name, count in location_counts.most_common(12):
        mentions = max(count, _count_entity_mentions(scan_text, name))
        if mentions < 1:
            continue
        key = _entity_key(name)
        if key in seen_locs:
            continue
        seen_locs.add(key)
        location_candidates.append(name)
        if len(location_candidates) >= 6:
            break

    # If the same candidate appears in both buckets, keep it as a location when it has a location keyword.
    loc_keys = {_entity_key(x) for x in location_candidates}
    character_candidates = [x for x in character_candidates if _entity_key(x) not in loc_keys]
    return character_candidates, location_candidates


def _auto_discover_canon_entities(db: Session, project_id: UUID, generated_text: str) -> dict[str, list[str]]:
    """Auto-add characters/locations created by AI so the user can track them in Canon.

    This intentionally stores only lightweight names/tags. The user can later edit appearance,
    personality, and setting details in the Canon sidebar.
    """
    characters, locations = _extract_auto_canon_candidates(generated_text)
    if not characters and not locations:
        return {"characters": [], "locations": []}

    scope = ensure_canon_scope(db, project_id)
    created_characters: list[str] = []
    created_locations: list[str] = []

    for name in characters:
        slug = _canon_slug(name)
        if get_character_by_slug(db, cast(UUID, cast(Any, scope).id), slug):
            continue
        row = lore_models.CanonCharacter(
            scope_id=cast(Any, scope).id,
            slug=slug,
            display_name=name,
            personality_json={"auto_discovered": True, "source": "ai_generated_content"},
        )
        db.add(row)
        db.flush()
        ensure_default_visual_variant(db, cast(UUID, cast(Any, row).id))
        created_characters.append(name)

    for name in locations:
        slug = _canon_slug(name)
        if get_location_by_slug(db, cast(UUID, cast(Any, scope).id), slug):
            continue
        row = lore_models.CanonLocation(
            scope_id=cast(Any, scope).id,
            slug=slug,
            display_name=name,
            env_style_tags=["auto-discovered"],
        )
        db.add(row)
        created_locations.append(name)

    db.commit()
    if created_characters or created_locations:
        print(f"[CANON] Auto-discovered characters={created_characters} locations={created_locations}")
    return {"characters": created_characters, "locations": created_locations}


def _build_recent_context(db: Session, project_id: str | UUID) -> str:
    pid = _project_uuid(project_id)
    entries = (
        db.query(models.ProjectContextEntry)
        .filter(models.ProjectContextEntry.project_id == pid)
        .order_by(models.ProjectContextEntry.created_at.desc())
        .limit(6)
        .all()
    )
    if not entries:
        return ""

    blocks = []
    for idx, entry in enumerate(reversed(entries), start=1):
        blocks.append(
            f"Lượt {idx}:\n"
            f"- Prompt: {entry.prompt}\n"
            f"- Nội dung đã sinh: {entry.generated_content[:900]}"
        )
    return "\n\n".join(blocks)


def _contains_vietnamese(text: str) -> bool:
    """Detect if text contains Vietnamese diacritics (beyond basic ASCII/Latin)."""
    vi_pattern = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.IGNORECASE)
    return bool(vi_pattern.search(text))


def _translate_prompt_for_image(prompt: str, api_key: str) -> str:
    """
    Dịch prompt tiếng Việt sang tiếng Anh cho model tạo ảnh.
    Dùng LLM để dịch chính xác hơn thay vì model dịch thuật đơn giản.
    Fallback: dùng Helsinki-NLP nếu LLM không khả dụng.
    """
    try:
        client = InferenceClient(token=api_key)
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an expert prompt engineer and translator specialized in converting Vietnamese image generation prompts to English.\n"
                    "Your task is to translate and optimize the user's prompt for text-to-image models (like Stable Diffusion or FLUX.1).\n"
                    "Follow these rules strictly:\n"
                    "1. Do NOT include conversational filler or meta-instructions like 'Create an image of', 'A photo of', 'Draw a', 'Depict a', 'Show a'. Start directly with the core subjects.\n"
                    "2. Translate accurately and descriptively. For example, translate 'cá voi có cánh' to 'winged whales' or 'whales with wings', NOT 'whale fish with wings'.\n"
                    "3. Keep all visual details, colors, actions, and background settings from the original prompt.\n"
                    "4. Format as a clean, structured description: [Subject(s) doing action], [Environment/Background details], [Lighting/Style/Vibe].\n"
                    "5. Output ONLY the translated English prompt. No introductions, no explanations, no quotes."
                ),
            },
            {"role": "user", "content": prompt},
        ]
        response = client.chat_completion(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=messages,
            max_tokens=512,
            temperature=0.3,
        )
        if response and response.choices:
            translated = str(response.choices[0].message.content).strip()
            if translated and not _contains_vietnamese(translated):
                print(f"[IMAGE] Translated prompt: {prompt!r} -> {translated!r}")
                return translated
    except Exception as e:
        print(f"[IMAGE] LLM translation failed, trying Helsinki-NLP: {e}")

    # Fallback: dùng translation model trực tiếp
    try:
        translated = _translate_text_via_hf(prompt, "vi-to-en", api_key)
        if translated and translated.strip() and not _contains_vietnamese(translated):
            print(f"[IMAGE] Helsinki-NLP translated: {prompt!r} -> {translated!r}")
            return translated.strip()
    except Exception as e:
        print(f"[IMAGE] Helsinki-NLP translation also failed: {e}")

    return prompt


def generate_image_content(
    instruction: str,
    model_name: str | None,
    hf_api_key: str | None,
) -> str:
    """
    Sinh ảnh qua Hugging Face Inference text-to-image.
    Tự động dịch prompt tiếng Việt sang tiếng Anh trước khi gửi cho model.
    Trả về chuỗi data URL PNG để frontend hiển thị trực tiếp.
    """
    try:
        from dotenv import find_dotenv

        load_dotenv(find_dotenv(), override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (hf_api_key or "").strip() or (env_key or "").strip()
        if not api_key:
            return (
                "Hệ thống chưa cấu hình Hugging Face API Key (hf_key_read). "
                "Thêm key trong Personalize hoặc liên hệ Admin."
            )

        model_id = (model_name or "").strip()
        if model_id not in HF_IMAGE_MODELS:
            model_id = "black-forest-labs/FLUX.1-schnell"

        # Auto-translate Vietnamese prompt to English for image models
        final_prompt = instruction.strip()
        if _contains_vietnamese(final_prompt):
            final_prompt = _translate_prompt_for_image(final_prompt, api_key)

        import requests
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        res = requests.post(
            f"https://router.huggingface.co/hf-inference/models/{model_id}",
            headers=headers,
            json={"inputs": final_prompt},
            timeout=90
        )
        if res.status_code != 200:
            raise RuntimeError(f"Hugging Face API returned status {res.status_code}: {res.text}")

        buf = io.BytesIO(res.content)
        try:
            # Verify if valid image
            img = PILImage.open(buf)
            img.verify()
        except Exception:
            raise RuntimeError(f"API response is not a valid image. Details: {res.content[:200]!r}")

        b64 = base64.b64encode(res.content).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        print(f"Lỗi text-to-image Hugging Face: {e}")
        error_text = str(e)
        if "402" in error_text or "payment required" in error_text.lower() or "depleted your monthly included credits" in error_text.lower():
            return (
                "Không tạo được ảnh vì Hugging Face Inference Provider đã hết credits tháng này. "
                "Bạn có thể thêm credits/nâng cấp PRO trên Hugging Face, hoặc vào Personalize để dùng một HF token khác còn quota."
            )
        return f"Không tạo được ảnh qua Hugging Face Inference. Chi tiết: {error_text}"



def generate_rolling_summary(
    db: Session,
    project_id: UUID,
    content: str,
    language: str,
    api_key: str,
) -> str | None:
    """Gọi LLM sinh tóm tắt diễn biến cốt truyện hiện tại và lưu vào DB."""
    if not content or not content.strip() or content == "Waiting for LLM generation...":
        return None

    words = content.split()
    if len(words) < 200:
        return None

    try:
        client = InferenceClient(token=api_key)
        model_id = "Qwen/Qwen2.5-72B-Instruct"

        # Lọc sạch nội dung truyện (bỏ qua các thẻ tag [[USER_PROMPT]] nếu có)
        clean_content = re.sub(r"\[\[USER_PROMPT\]\].*?---", "", content, flags=re.DOTALL).strip()
        clean_content = re.sub(r"---", "", clean_content).strip()

        # Chỉ lấy phần cuối để tránh tràn ngữ cảnh
        if len(clean_content) > 8000:
            clean_content = "[...] " + clean_content[-8000:]

        if language == "vietnamese":
            system_instruction = (
                "Bạn là một biên tập viên chuyên nghiệp. Hãy tóm tắt ngắn gọn diễn biến cốt truyện chính và sự phát triển của các nhân vật từ đầu đến giờ. "
                "Bản tóm tắt cần ngắn gọn, súc tích (dưới 200 từ) để làm ngữ cảnh nền cho chương tiếp theo. "
                "Chỉ trả về bản tóm tắt bằng tiếng Việt, không thêm lời chào hay giải thích nào khác."
            )
            user_message = f"Nội dung truyện cần tóm tắt:\n{clean_content}\n\nTóm tắt:"
        else:
            system_instruction = (
                "You are a professional editor. Summarize the main plot and character developments of this story so far. "
                "Keep the summary brief and concise (under 200 words) so it can serve as a background context. "
                "Respond in the language of the story (english). "
                "Output only the summary without any greeting or extra text."
            )
            user_message = f"Story content to summarize:\n{clean_content}\n\nSummary:"

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_message}
        ]

        response = client.chat_completion(
            model=model_id,
            messages=messages,
            max_tokens=400,
            temperature=0.3
        )

        if response and response.choices:
            summary = str(response.choices[0].message.content).strip()
            if summary:
                # Lưu vào database
                project = db.query(models.Project).filter(models.Project.id == project_id).first()
                if project:
                    setattr(project, "rolling_summary", summary)
                    db.commit()
                return summary
    except Exception as e:
        print(f"[WARN] Failed to generate rolling summary: {e}")
    return None



def generate_story_content(
    db: Session,
    project_id: UUID,
    title: str,
    instruction: str,
    language: str = "vietnamese",
    model_name: str | None = None,
    hf_api_key: str | None = None,
    canon_context_pack: str | None = None,
    min_words: int | None = None,
    max_words: int | None = None,
    rolling_summary: str | None = None,
) -> str:
    generated_content = ""
    try:
        from dotenv import find_dotenv
        load_dotenv(find_dotenv(), override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (hf_api_key or "").strip() or (env_key or "").strip()

        if not api_key:
            return "Hệ thống chưa cấu hình Hugging Face API Key (hf_key_read). Thêm key tạm trong Personalize hoặc liên hệ Admin."

        model_id = (model_name or "").strip() or "Qwen/Qwen2.5-72B-Instruct"

        client = InferenceClient(token=api_key)

        language_label = "vietnamese" if language == "vietnamese" else "english"
        if language_label == "english":
            system_prompt = (
                "You are a creative fiction writer. "
                "Always respond in the selected language: english."
            )
        else:
            system_prompt = (
                "Bạn là một nhà văn chuyên sáng tác truyện hư cấu bằng tiếng Việt tinh khiết.\n"
                "YÊU CẦU BẮT BUỘC: Bạn chỉ được viết bằng tiếng Việt. Tuyệt đối KHÔNG sử dụng tiếng Trung (chữ Hán), tiếng Anh hay bất kỳ ghi chú ngoài lề nào trong phản hồi, chỉ trả về nội dung truyện hoàn toàn bằng tiếng Việt."
            )

        messages = build_context_messages(
            db=db,
            project_id=project_id,
            system_prompt=system_prompt,
            title=title,
            latest_user_message=instruction,
            language=language,
            hf_api_key=api_key,
            canon_context_pack=canon_context_pack,
            min_words=min_words,
            max_words=max_words,
            rolling_summary=rolling_summary,
        )

        max_retries = 15
        max_tokens_per_call = 4096
        max_continuations = 3  # Tăng lên tối đa 3 lần nối tiếp để đạt số lượng từ mong muốn

        for attempt in range(max_retries):
            try:
                response = client.chat_completion(
                    model=model_id,
                    messages=messages,
                    max_tokens=max_tokens_per_call,
                    temperature=0.7
                )

                if response and response.choices:
                    choice = response.choices[0]
                    generated_content = str(choice.message.content).strip()

                    # Logic tiếp nối tự động dựa trên độ dài (min_words/max_words) hoặc finish_reason
                    current_words = len(generated_content.split())
                    finish_reason = getattr(choice, "finish_reason", None)
                    
                    should_continue = (finish_reason == "length" or (min_words and current_words < min_words))

                    if should_continue and generated_content:
                        cont_messages = list(messages) + [
                            {"role": "assistant", "content": generated_content}
                        ]
                        for _cont in range(max_continuations):
                            current_words = len(generated_content.split())
                            if max_words and current_words >= max_words:
                                break

                            # Xây dựng prompt nhắc nhở độ dài phù hợp
                            if min_words and current_words < min_words:
                                user_prompt = (
                                    f"Nội dung hiện tại mới chỉ có {current_words} từ. "
                                    f"Hãy tiếp tục câu chuyện để đạt độ dài tối thiểu {min_words} từ. "
                                    f"Bắt đầu viết tiếp ngay từ chỗ bạn vừa dừng, tuyệt đối không lặp lại nội dung đã viết."
                                    if language == "vietnamese" else
                                    f"The current content has only {current_words} words. "
                                    f"Please continue the story to reach at least {min_words} words. "
                                    f"Start writing immediately from where you left off, without repeating any content."
                                )
                            else:
                                user_prompt = (
                                    "Hãy viết tiếp phần còn lại, bắt đầu ngay từ chỗ bạn dừng. Không lặp lại nội dung đã viết."
                                    if language == "vietnamese" else
                                    "Please continue writing the rest, starting immediately from where you stopped. Do not repeat written content."
                                )

                            # Nếu gần đạt giới hạn tối đa, nhắc nhở kết thúc
                            if max_words and current_words >= max_words - 250:
                                user_prompt = (
                                    f"Nội dung đã đạt {current_words} từ, gần giới hạn tối đa {max_words} từ. "
                                    f"Hãy nhanh chóng viết phần kết cho chương truyện này một cách súc tích và kết thúc chương ngay lập tức."
                                    if language == "vietnamese" else
                                    f"The content has reached {current_words} words, near the limit of {max_words}. "
                                    f"Please quickly write a conclusion for this chapter in a concise manner and stop generating immediately."
                                )

                            cont_messages.append({"role": "user", "content": user_prompt})

                            try:
                                cont_resp = client.chat_completion(
                                    model=model_id,
                                    messages=cont_messages,
                                    max_tokens=max_tokens_per_call,
                                    temperature=0.7
                                )
                                if cont_resp and cont_resp.choices:
                                    cont_choice = cont_resp.choices[0]
                                    cont_text = str(cont_choice.message.content).strip()
                                    if cont_text:
                                        generated_content += "\n\n" + cont_text
                                    cont_finish = getattr(cont_choice, "finish_reason", None)
                                    cont_words = len(generated_content.split())
                                    
                                    cont_messages = list(messages) + [
                                        {"role": "assistant", "content": generated_content}
                                    ]
                                    
                                    if cont_finish != "length" and (not min_words or cont_words >= min_words):
                                        break
                                else:
                                    break
                            except Exception as cont_err:
                                print(f"[WARN] Auto-continue failed: {cont_err}")
                                break
                else:
                    generated_content = "AI không thể sinh nội dung với cấu hình Prompt này, hoặc model đang quá tải trên Hugging Face."
                break

            except Exception as model_e:
                err_str = str(model_e).lower()
                if ("loading" in err_str or "503" in err_str or "unavailable" in err_str or "overloaded" in err_str):
                    if attempt < max_retries - 1:
                        print(f"Server AI đang boot... Đợi 10s rồi thử lại (Lần {attempt+1}/{max_retries})")
                        time.sleep(10)
                        continue
                raise model_e

    except Exception as e:
        print(f"Lỗi khi gọi Hugging Face API: {e}")
        generated_content = f"Xin lỗi, quá trình sinh nội dung bằng Hugging Face bị gián đoạn.\nChi tiết (Model 72B đang cạn tài nguyên trên Inference API lúc này): {str(e)}"

    return generated_content


def generate_story_content_stream(
    db: Session,
    project_id: UUID,
    title: str,
    instruction: str,
    language: str = "vietnamese",
    model_name: str | None = None,
    hf_api_key: str | None = None,
    canon_context_pack: str | None = None,
    min_words: int | None = None,
    max_words: int | None = None,
    rolling_summary: str | None = None,
):
    try:
        from dotenv import find_dotenv
        load_dotenv(find_dotenv(), override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (hf_api_key or "").strip() or (env_key or "").strip()

        if not api_key:
            yield "Hệ thống chưa cấu hình Hugging Face API Key (hf_key_read). Thêm key tạm trong Personalize hoặc liên hệ Admin."
            return

        model_id = (model_name or "").strip() or "Qwen/Qwen2.5-72B-Instruct"

        client = InferenceClient(token=api_key)

        language_label = "vietnamese" if language == "vietnamese" else "english"
        if language_label == "english":
            system_prompt = (
                "You are a creative fiction writer. "
                "Always respond in the selected language: english."
            )
        else:
            system_prompt = (
                "Bạn là một nhà văn chuyên sáng tác truyện hư cấu bằng tiếng Việt tinh khiết.\n"
                "YÊU CẦU BẮT BUỘC: Bạn chỉ được viết bằng tiếng Việt. Tuyệt đối KHÔNG sử dụng tiếng Trung (chữ Hán), tiếng Anh hay bất kỳ ghi chú ngoài lề nào trong phản hồi, chỉ trả về nội dung truyện hoàn toàn bằng tiếng Việt."
            )

        messages = build_context_messages(
            db=db,
            project_id=project_id,
            system_prompt=system_prompt,
            title=title,
            latest_user_message=instruction,
            language=language,
            hf_api_key=api_key,
            canon_context_pack=canon_context_pack,
            min_words=min_words,
            max_words=max_words,
            rolling_summary=rolling_summary,
        )

        response = client.chat_completion(
            model=model_id,
            messages=messages,
            max_tokens=4096,
            temperature=0.7,
            stream=True
        )

        for chunk in response:
            if chunk.choices:
                text = chunk.choices[0].delta.content
                if text:
                    yield text

    except Exception as e:
        print(f"Lỗi khi gọi Hugging Face Streaming API: {e}")
        yield f"Xin lỗi, quá trình sinh nội dung bằng Hugging Face bị gián đoạn: {str(e)}"



def _sleep_seconds(value: float) -> None:
    if value > 0:
        time.sleep(value)


def _build_translate_instruction(mode: str, text: str) -> str:
    if mode == "vi-to-en":
        return f"translate Vietnamese to English: {text}"
    return f"translate English to Vietnamese: {text}"


def _split_text_chunks(text: str, max_chunk_len: int = MAX_TRANSLATE_CHUNK) -> list[str]:
    cleaned = text.strip()
    if not cleaned:
        return [""]

    paragraphs = cleaned.split("\n\n")
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) <= max_chunk_len:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(paragraph) <= max_chunk_len:
            current = paragraph
            continue

        sentence_parts = paragraph.replace("\n", " ").split(". ")
        sentence_chunk = ""
        for part in sentence_parts:
            candidate_sentence = f"{sentence_chunk}. {part}" if sentence_chunk else part
            if len(candidate_sentence) <= max_chunk_len:
                sentence_chunk = candidate_sentence
            else:
                if sentence_chunk:
                    chunks.append(sentence_chunk)
                sentence_chunk = part
        if sentence_chunk:
            current = sentence_chunk

    if current:
        chunks.append(current)
    return chunks or [cleaned]


def _extract_translated_text(payload: object) -> str | None:
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict):
            translated = first.get("translation_text") or first.get("generated_text")
            if isinstance(translated, str):
                return translated.strip()
    if isinstance(payload, dict):
        translated = payload.get("translation_text") or payload.get("generated_text")
        if isinstance(translated, str):
            return translated.strip()
    return None


def _normalize_whitespace(text: str) -> str:
    lines = [ln.rstrip() for ln in text.splitlines()]
    return "\n".join(lines).strip()


def _has_long_repeated_word_streak(text: str) -> bool:
    return re.search(r"\b([A-Za-zÀ-ỹ0-9']+)(?:\s+\1){4,}\b", text, flags=re.IGNORECASE) is not None


def _looks_like_low_quality_translation(source_text: str, translated_text: str) -> bool:
    translated = _normalize_whitespace(translated_text)
    source = _normalize_whitespace(source_text)

    if not translated:
        return True
    if _has_long_repeated_word_streak(translated):
        return True

    tokens = re.findall(r"[A-Za-zÀ-ỹ0-9']+", translated.lower())
    if len(tokens) < 6:
        return len(source) > 40

    # Từ lặp liên tiếp thường báo hiệu generation bị suy biến.
    streak = 1
    longest_streak = 1
    for i in range(1, len(tokens)):
        if tokens[i] == tokens[i - 1]:
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 1
    if longest_streak >= 4:
        return True

    unique_ratio = len(set(tokens)) / max(len(tokens), 1)
    if len(tokens) >= 24 and unique_ratio < 0.3:
        return True

    source_tokens = re.findall(r"[A-Za-zÀ-ỹ0-9']+", source)
    if len(source_tokens) >= 28 and len(tokens) < max(8, int(len(source_tokens) * 0.35)):
        return True

    return False


def _is_unexpected_language_artifact(mode: str, translated_text: str) -> bool:
    vi_chars = re.findall(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", translated_text.lower())
    en_like_tokens = re.findall(r"[A-Za-z']+", translated_text)

    if mode == "vi-to-en":
        # Bản dịch EN mà còn bất kỳ dấu tiếng Việt nào cũng coi là lỗi dịch.
        if len(vi_chars) >= 1:
            return True
    elif mode == "en-to-vi":
        # Bản dịch VI mà quá ít dấu tiếng Việt trên đoạn dài thường là dịch chưa ra tiếng Việt.
        if len(en_like_tokens) >= 40 and len(vi_chars) <= 1:
            return True
    return False


def _translate_text_via_hf(text: str, mode: str, api_key: str) -> str:
    if not text.strip():
        return text

    chunks = _split_text_chunks(text)
    translated_chunks: list[str] = []

    for idx, chunk in enumerate(chunks):
        body = {
            "inputs": chunk,
            "options": {"wait_for_model": True},
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        candidate_endpoints = HF_TRANSLATION_URLS_BY_MODE.get(mode, HF_TRANSLATION_URLS_BY_MODE["vi-to-en"])

        translated_this_chunk = False
        for endpoint in candidate_endpoints:
            max_retries = 3
            for attempt in range(max_retries):
                # T5 fallback cần prompt có instruction; model dịch chuyên dụng thì dùng raw text.
                endpoint_body = body.copy()
                if "google-t5/t5-base" in endpoint:
                    endpoint_body["inputs"] = _build_translate_instruction(mode, chunk)

                req = urlrequest.Request(
                    endpoint,
                    data=json.dumps(endpoint_body).encode("utf-8"),
                    headers=headers,
                    method="POST",
                )
                try:
                    with urlrequest.urlopen(req, timeout=90) as response:
                        payload = json.loads(response.read().decode("utf-8"))
                        translated = _extract_translated_text(payload)
                        if translated is not None and translated.strip():
                            candidate_text = _normalize_whitespace(translated)
                            if _looks_like_low_quality_translation(chunk, candidate_text) or _is_unexpected_language_artifact(mode, candidate_text):
                                if attempt < max_retries - 1:
                                    _sleep_seconds(1.0)
                                    continue
                                break
                            translated_chunks.append(candidate_text)
                            translated_this_chunk = True
                            break
                        if attempt < max_retries - 1:
                            _sleep_seconds(1.2)
                            continue
                        break
                except HTTPError as e:
                    raw = e.read().decode("utf-8") if e.fp else ""
                    payload = {}
                    if raw:
                        try:
                            payload = json.loads(raw)
                        except json.JSONDecodeError:
                            payload = {}
                    err_text = str(payload.get("error", "")).strip() if isinstance(payload, dict) else ""
                    estimated = payload.get("estimated_time") if isinstance(payload, dict) else None
                    should_retry = e.code in (429, 503) or "loading" in err_text.lower() or "unavailable" in err_text.lower()
                    if should_retry and attempt < max_retries - 1:
                        wait_seconds = 1.5
                        if isinstance(estimated, (int, float)):
                            wait_seconds = max(wait_seconds, float(estimated))
                        _sleep_seconds(wait_seconds)
                        continue
                    break
                except URLError:
                    if attempt < max_retries - 1:
                        _sleep_seconds(1.5)
                        continue
                    break
                except (TimeoutError, socket.timeout):
                    if attempt < max_retries - 1:
                        _sleep_seconds(2.0)
                        continue
                    break
            if translated_this_chunk:
                break

        if not translated_this_chunk:
            # Thử lại lần cuối với chunk nhỏ hơn để giảm timeout và tăng tỷ lệ dịch full.
            mini_chunks = _split_text_chunks(chunk, FINE_GRAIN_TRANSLATE_CHUNK)
            mini_results: list[str] = []
            mini_ok = True

            for mini in mini_chunks:
                if not mini.strip():
                    mini_results.append(mini)
                    continue

                mini_translated = False
                for endpoint in candidate_endpoints:
                    for attempt in range(2):
                        endpoint_body = {
                            "inputs": mini,
                            "options": {"wait_for_model": True},
                        }
                        if "google-t5/t5-base" in endpoint:
                            endpoint_body["inputs"] = _build_translate_instruction(mode, mini)

                        req = urlrequest.Request(
                            endpoint,
                            data=json.dumps(endpoint_body).encode("utf-8"),
                            headers=headers,
                            method="POST",
                        )
                        try:
                            with urlrequest.urlopen(req, timeout=70) as response:
                                payload = json.loads(response.read().decode("utf-8"))
                                translated = _extract_translated_text(payload)
                                if translated:
                                    candidate_text = _normalize_whitespace(translated)
                                    if _looks_like_low_quality_translation(mini, candidate_text) or _is_unexpected_language_artifact(mode, candidate_text):
                                        if attempt == 0:
                                            _sleep_seconds(0.8)
                                            continue
                                        break
                                    mini_results.append(candidate_text)
                                    mini_translated = True
                                    break
                        except (HTTPError, URLError, TimeoutError, socket.timeout):
                            if attempt == 0:
                                _sleep_seconds(0.9)
                                continue
                    if mini_translated:
                        break

                if not mini_translated:
                    mini_ok = False
                    break

            if mini_ok and mini_results:
                translated_chunks.append("\n\n".join(mini_results))
            else:
                # Không fail toàn bộ export nếu chỉ 1 chunk dịch lỗi:
                # giữ nguyên chunk gốc để tài liệu vẫn usable.
                translated_chunks.append(chunk)

    return "\n\n".join(translated_chunks)

@router.get("/", response_model=List[models.ProjectResponse])
def get_all_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Lấy toàn bộ Project của User ĐANG ĐĂNG NHẬP.
    Dependency get_current_user sẽ chặn mọi request không có Token hợp lệ.
    """
    # Lấy ra tất cả các Project mà có user_id khớp với ID của current_user (từ Token)
    projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).all()
    
    # Ép kiểu UUID của pydantic trả về (do JSON không hỗ trợ uuid gốc)
    return [
        models.ProjectResponse(
            id=str(cast(Any, p).id),
            title=str(cast(Any, p).title),
            prompt=str(cast(Any, p).prompt),
            content=str(cast(Any, p).content)
        ) for p in projects
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_project(
    data: models.ProjectCreateReq,
    stream: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    """
    API Tạo Project mới và sinh nội dung bằng Hugging Face Model (FrostAura).
    Bắt buộc có JWT Token.
    Optional: header X-HF-Api-Key — key HF tạm của user (không lưu server).
    """
    # Kiểm tra loại model: audio, image hoặc text LLM.
    audio_models = [VIENEU_TTS_MODEL, FPT_TTS_MODEL]
    is_audio_model = data.model_name and data.model_name in audio_models
    is_image_model = bool(data.model_name and data.model_name in HF_IMAGE_MODELS)
    effective_prompt = _apply_persona_context(data.prompt, data.persona_context)

    # 1. Tạo project trước để canon_scope / lore FK có project_id ổn định
    new_project = models.Project(
        user_id=current_user.id,
        title=data.title,
        prompt=data.prompt,
        content="",
        min_words=data.min_words,
        max_words=data.max_words,
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    pid = cast(UUID, cast(Any, new_project).id)

    # 2. Sinh nội dung theo mode
    if is_audio_model:
        generated_content = _extract_tts_text(data.prompt)
    elif is_image_model:
        ensure_canon_scope(db, pid)
        mid = (data.model_name or "").strip() or "black-forest-labs/FLUX.1-schnell"
        if canon_engine_enabled() and project_has_canon_characters(db, pid):
            out, _meta = run_canon_image_pipeline(db, pid, effective_prompt, mid, x_hf_api_key)
            generated_content = (
                out if out.startswith("data:image") else generate_image_content(effective_prompt, data.model_name, x_hf_api_key)
            )
        else:
            generated_content = generate_image_content(
                instruction=effective_prompt,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
            )
    else:
        scope = ensure_canon_scope(db, pid)
        pack = None
        if canon_engine_enabled():
            pack = build_story_context_pack(db, pid, effective_prompt, x_hf_api_key, project_content="")
        
        if stream:
            def event_generator():
                yield f"event: init\ndata: {json.dumps({'id': str(pid)})}\n\n"
                generated_content = ""
                try:
                    for chunk in generate_story_content_stream(
                        db=db,
                        project_id=pid,
                        title=data.title,
                        instruction=effective_prompt,
                        language=data.language,
                        model_name=data.model_name,
                        hf_api_key=x_hf_api_key,
                        canon_context_pack=pack,
                        min_words=data.min_words,
                        max_words=data.max_words,
                        rolling_summary=None,
                    ):
                        generated_content += chunk
                        yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"
                    
                    proj = db.query(models.Project).filter(models.Project.id == pid).first()
                    if proj:
                        cast(Any, proj).content = generated_content
                        db.commit()
                        db.refresh(proj)
                        
                        # Generate rolling summary
                        load_dotenv(override=True)
                        env_key = os.getenv("hf_key_read")
                        api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()
                        if api_key:
                            generate_rolling_summary(db, pid, generated_content, data.language, api_key)

                    db.add(
                        models.ProjectContextEntry(
                            project_id=pid,
                            prompt=data.prompt,
                            language=data.language,
                            generated_content=generated_content,
                        )
                    )
                    db.commit()

                    if scope:
                        try:
                            append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), generated_content, x_hf_api_key)
                        except Exception as chunk_err:
                            print(f"[WARN] lore chunk append failed: {chunk_err}")

                    canon_update = _auto_discover_canon_entities(db, pid, generated_content)
                    if canon_update["characters"] or canon_update["locations"]:
                        yield f"event: canon\ndata: {json.dumps(canon_update)}\n\n"
                except Exception as stream_err:
                    print(f"[ERROR] Stream generator error: {stream_err}")
                    proj = db.query(models.Project).filter(models.Project.id == pid).first()
                    if proj and generated_content.strip():
                        cast(Any, proj).content = generated_content
                        db.commit()
                    yield f"event: error\ndata: {json.dumps({'detail': str(stream_err)})}\n\n"
                finally:
                    yield f"event: done\ndata: {json.dumps({'content': generated_content})}\n\n"

            return StreamingResponse(event_generator(), media_type="text/event-stream")
        else:
            generated_content = generate_story_content(
                db=db,
                project_id=pid,
                title=data.title,
                instruction=effective_prompt,
                language=data.language,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
                canon_context_pack=pack,
                min_words=data.min_words,
                max_words=data.max_words,
                rolling_summary=None,
            )
            if scope:
                try:
                    append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), generated_content, x_hf_api_key)
                except Exception as chunk_err:
                    print(f"[WARN] lore chunk append failed: {chunk_err}")

    if not stream:
        cast(Any, new_project).content = generated_content
        db.commit()
        db.refresh(new_project)

        # Generate rolling summary
        load_dotenv(override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()
        if api_key:
            generate_rolling_summary(db, pid, generated_content, data.language, api_key)

        db.add(
            models.ProjectContextEntry(
                project_id=pid,
                prompt=data.prompt,
                language=data.language,
                generated_content=generated_content,
            )
        )
        db.commit()

        if not (is_audio_model or is_image_model):
            _auto_discover_canon_entities(db, pid, generated_content)

        # 3. Audio model: chỉ lưu text, TTS sẽ được frontend gọi riêng
        if is_audio_model:
            new_project_obj = cast(Any, new_project)
            new_project_obj.content = f"{new_project_obj.content}\n\n<!-- audio_pending: {generated_content} -->"
            db.commit()

    new_project_obj = cast(Any, new_project)
    return models.ProjectResponse(
        id=str(new_project_obj.id),
        title=str(new_project_obj.title),
        prompt=str(new_project_obj.prompt),
        content=str(new_project_obj.content),
        rolling_summary=getattr(new_project_obj, "rolling_summary", None),
        min_words=getattr(new_project_obj, "min_words", 1000),
        max_words=getattr(new_project_obj, "max_words", 2000),
    )


@router.post("/translate-export", response_model=models.ExportTranslateResp)
def translate_for_export(
    data: models.ExportTranslateReq,
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    _ = current_user
    load_dotenv(override=True)
    env_key = os.getenv("hf_key_read")
    api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu Hugging Face API key. Hãy thêm key trong Personalize hoặc cấu hình hf_key_read trên server.",
        )

    return models.ExportTranslateResp(
        title=_translate_text_via_hf(data.title, data.mode, api_key),
        prompt=_translate_text_via_hf(data.prompt, data.mode, api_key),
        content=_translate_text_via_hf(data.content, data.mode, api_key),
    )


@router.post("/{project_id}/continue")
def continue_project(
    project_id: str,
    data: models.ProjectContinueReq,
    stream: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if getattr(project, "user_id", None) != getattr(current_user, "id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    audio_models = [VIENEU_TTS_MODEL, FPT_TTS_MODEL]
    is_audio_model = data.model_name and data.model_name in audio_models
    is_image_model = bool(data.model_name and data.model_name in HF_IMAGE_MODELS)
    effective_prompt = _apply_persona_context(data.prompt, data.persona_context)

    # Cấu hình min/max words
    proj_min = getattr(project, "min_words", None)
    proj_max = getattr(project, "max_words", None)
    min_w = int(data.min_words or (proj_min if proj_min is not None else 1000))
    max_w = int(data.max_words or (proj_max if proj_max is not None else 2000))
    setattr(project, "min_words", min_w)
    setattr(project, "max_words", max_w)
    db.commit()
    r_summary = str(project.rolling_summary) if project.rolling_summary is not None else None


    project_obj = cast(Any, project)
    project_content = str(project_obj.content or "")
    project_title = str(project_obj.title)

    if is_audio_model:
        new_chunk_text = _extract_tts_text(data.prompt)
        new_chunk = f"{new_chunk_text}\n\n<!-- audio_pending: {new_chunk_text} -->"

    elif is_image_model:
        ensure_canon_scope(db, pid)
        mid = (data.model_name or "").strip() or "black-forest-labs/FLUX.1-schnell"
        if canon_engine_enabled() and project_has_canon_characters(db, pid):
            out, _meta = run_canon_image_pipeline(db, pid, effective_prompt, mid, x_hf_api_key)
            new_chunk = (
                out if out.startswith("data:image") else generate_image_content(effective_prompt, data.model_name, x_hf_api_key)
            )
        else:
            new_chunk = generate_image_content(
                instruction=effective_prompt,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
            )
    else:
        scope = ensure_canon_scope(db, pid)
        pack = None
        if canon_engine_enabled():
            pack = build_story_context_pack(db, pid, effective_prompt, x_hf_api_key, project_content=project_content)
        
        if stream:
            def event_generator():
                yield f"event: init\ndata: {json.dumps({'id': str(pid)})}\n\n"
                new_chunk = ""
                try:
                    for chunk in generate_story_content_stream(
                        db=db,
                        project_id=pid,
                        title=project_title,
                        instruction=effective_prompt,
                        language=data.language,
                        model_name=data.model_name,
                        hf_api_key=x_hf_api_key,
                        canon_context_pack=pack if canon_engine_enabled() else None,
                        min_words=min_w,
                        max_words=max_w,
                        rolling_summary=r_summary,
                    ):
                        new_chunk += chunk
                        yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"

                    if data.prompt and data.prompt.strip():
                        user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
                        continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
                    else:
                        continuation_chunk = new_chunk
                    
                    proj = db.query(models.Project).filter(models.Project.id == pid).first()
                    if proj:
                        proj_obj = cast(Any, proj)
                        base_content = str(proj_obj.content or "")
                        if base_content and base_content.strip():
                            proj_obj.content = f"{base_content.rstrip()}\n\n---\n\n{continuation_chunk}"
                        else:
                            proj_obj.content = continuation_chunk
                        db.commit()
                        db.refresh(proj)
                        
                        # Generate rolling summary
                        load_dotenv(override=True)
                        env_key = os.getenv("hf_key_read")
                        api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()
                        if api_key:
                            generate_rolling_summary(db, pid, proj_obj.content, data.language, api_key)

                    db.add(
                        models.ProjectContextEntry(
                            project_id=pid,
                            prompt=data.prompt,
                            language=data.language,
                            generated_content=new_chunk,
                        )
                    )
                    db.commit()

                    if scope:
                        try:
                            append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), new_chunk, x_hf_api_key)
                        except Exception as chunk_err:
                            print(f"[WARN] lore chunk append failed: {chunk_err}")

                    canon_update = _auto_discover_canon_entities(db, pid, new_chunk)
                    if canon_update["characters"] or canon_update["locations"]:
                        yield f"event: canon\ndata: {json.dumps(canon_update)}\n\n"
                except Exception as stream_err:
                    print(f"[ERROR] Stream generator error: {stream_err}")
                    if new_chunk.strip():
                        if data.prompt and data.prompt.strip():
                            user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
                            continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
                        else:
                            continuation_chunk = new_chunk
                        proj = db.query(models.Project).filter(models.Project.id == pid).first()
                        if proj:
                            proj_obj = cast(Any, proj)
                            base_content = str(proj_obj.content or "")
                            if base_content and base_content.strip():
                                proj_obj.content = f"{base_content.rstrip()}\n\n---\n\n{continuation_chunk}"
                            else:
                                proj_obj.content = continuation_chunk
                            db.commit()
                    yield f"event: error\ndata: {json.dumps({'detail': str(stream_err)})}\n\n"
                finally:
                    proj = db.query(models.Project).filter(models.Project.id == pid).first()
                    final_full_content = str(proj.content) if proj else ""
                    yield f"event: done\ndata: {json.dumps({'content': final_full_content})}\n\n"

            return StreamingResponse(event_generator(), media_type="text/event-stream")
        else:
            new_chunk = generate_story_content(
                db=db,
                project_id=pid,
                title=project_title,
                instruction=effective_prompt,
                language=data.language,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
                canon_context_pack=pack if canon_engine_enabled() else None,
                min_words=min_w,
                max_words=max_w,
                rolling_summary=r_summary,
            )
            if scope:
                try:
                    append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), new_chunk, x_hf_api_key)
                except Exception as chunk_err:
                    print(f"[WARN] lore chunk append failed: {chunk_err}")

    if not stream:
        project_obj = cast(Any, project)
        if data.prompt and data.prompt.strip():
            user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
            continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
        else:
            continuation_chunk = new_chunk
        if project_content and project_content.strip():
            project_obj.content = f"{project_content.rstrip()}\n\n---\n\n{continuation_chunk}"
        else:
            project_obj.content = continuation_chunk

        db.commit()
        db.refresh(project)

        # Generate rolling summary
        load_dotenv(override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()
        if api_key:
            generate_rolling_summary(db, pid, project_obj.content, data.language, api_key)

        db.add(
            models.ProjectContextEntry(
                project_id=cast(UUID, project_obj.id),
                prompt=data.prompt,
                language=data.language,
                generated_content=new_chunk,
            )
        )
        db.commit()

        if not (is_audio_model or is_image_model):
            _auto_discover_canon_entities(db, pid, new_chunk)

    project_obj = cast(Any, project)
    return models.ProjectResponse(
        id=str(project_obj.id),
        title=str(project_obj.title),
        prompt=str(project_obj.prompt),
        content=str(project_obj.content),
        rolling_summary=getattr(project_obj, "rolling_summary", None),
        min_words=getattr(project_obj, "min_words", 1000),
        max_words=getattr(project_obj, "max_words", 2000),
    )


@router.post("/{project_id}/attach-audio")
async def attach_audio(
    project_id: str,
    audio_b64: str = Form(..., description="Base64-encoded WAV audio"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if getattr(project, "user_id", None) != getattr(current_user, "id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu audio_b64 không hợp lệ.")

    audio_bytes = _ensure_wav_header(audio_bytes)
    stored_bytes, ext = to_mp3_if_possible(audio_bytes)
    audio_filename = f"audio_{pid}_{int(time.time() * 1000)}.{ext}"
    upload_dir = get_audio_upload_dir()
    os.makedirs(upload_dir, exist_ok=True)
    audio_path = os.path.join(upload_dir, audio_filename)
    with open(audio_path, "wb") as f:
        f.write(stored_bytes)

    audio_web_path = f"/uploads/audio/{audio_filename}"
    project_obj = cast(Any, project)
    current_content = str(project_obj.content or "")
    # Replace the pending marker with audio path on its own segment
    audio_block = f"\n\n---\n\n{audio_web_path}"
    updated_content = current_content.replace(
        f"<!-- audio_pending: {project.prompt} -->", audio_block
    )
    if updated_content == current_content:
        updated_content = f"{current_content}{audio_block}"
    project_obj.content = updated_content

    audio_file = models.AudioFile(
        project_id=pid,
        title=f"Audio for {project.title}",
        audio_url=audio_web_path,
    )
    db.add(audio_file)
    db.commit()

    return {"audio_url": audio_web_path}


@router.get("/{project_id}", response_model=models.ProjectResponse)
def get_project_by_id(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Lấy chi tiết 1 Project theo ID.
    Bắt buộc phải kiểm tra quyền sở hữu (ownership).
    """
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()

    # 1. Kiểm tra Project có tồn tại không
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")

    # 2. Quan Trọng: Kiểm tra quyền sở hữu
    if getattr(project, "user_id", None) != getattr(current_user, "id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    project_obj = cast(Any, project)
    
    # Query chapters ordered by chapter_number for modular chapter support
    chapters = db.query(models.Chapter).filter(models.Chapter.project_id == pid).order_by(models.Chapter.chapter_number.asc()).all()
    if chapters:
        assembled_content = ""
        for idx, ch in enumerate(chapters):
            chapter_header = f"# Chương {ch.chapter_number}: {ch.title}"
            # Format: Include title and content
            chapter_body = f"{chapter_header}\n\n{ch.content}"
            if idx == 0:
                assembled_content = chapter_body
            else:
                assembled_content = f"{assembled_content}\n\n---\n\n{chapter_body}"
        project_content = assembled_content
    else:
        project_content = str(project_obj.content or "")

    return models.ProjectResponse(
        id=str(project_obj.id),
        title=str(project_obj.title),
        prompt=str(project_obj.prompt),
        content=project_content,
        rolling_summary=getattr(project_obj, "rolling_summary", None),
        min_words=getattr(project_obj, "min_words", 1000),
        max_words=getattr(project_obj, "max_words", 2000),
    )



@router.get("/{project_id}/contexts")
def get_project_contexts(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if getattr(project, "user_id", None) != getattr(current_user, "id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    entries = (
        db.query(models.ProjectContextEntry)
        .filter(models.ProjectContextEntry.project_id == project.id)
        .order_by(models.ProjectContextEntry.created_at.asc())
        .all()
    )

    return {
        "project_id": str(project.id),
        "contexts": [
            {
                "id": str(e.id),
                "prompt": e.prompt,
                "language": e.language,
                "generated_content": e.generated_content,
                "created_at": e.created_at,
            }
            for e in entries
        ],
    }


@router.post("/generate-title")
def generate_title(
    data: models.TitleGenerateReq,
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    _ = current_user
    load_dotenv(override=True)
    env_key = os.getenv("hf_key_read")
    api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()

    if not api_key:
        fallback = data.prompt.strip()[:30]
        if len(data.prompt.strip()) > 30:
            fallback += "..."
        return {"title": fallback}

    try:
        client = InferenceClient(token=api_key)
        model_id = "Qwen/Qwen2.5-72B-Instruct"
        
        system_instruction = (
            "You are a professional editor. "
            "Generate a very short, creative, and catchy title (2 to 4 words) in the user's language "
            "(either Vietnamese or English) based on their prompt. "
            "Respond ONLY with the title. Do not include quotation marks, markdown, or extra explanations."
        )
        
        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Prompt: {data.prompt}"}
        ]
        
        response = client.chat_completion(
            model=model_id,
            messages=messages,
            max_tokens=30,
            temperature=0.7
        )
        
        title = ""
        if response.choices:
            title = response.choices[0].message.content or ""
        
        title = title.strip().replace('"', '').replace("'", "").strip()
        if not title:
            raise ValueError("Empty response from AI")
            
        return {"title": title}
    except Exception as e:
        print(f"[WARN] Failed to auto-generate title via AI: {e}")
        fallback = data.prompt.strip()[:30]
        if len(data.prompt.strip()) > 30:
            fallback += "..."
        return {"title": fallback}


@router.post("/optimize-prompt", response_model=models.PromptOptimizeResp)
def optimize_prompt(
    data: models.PromptOptimizeReq,
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    _ = current_user
    load_dotenv(override=True)
    env_key = os.getenv("hf_key_read")
    api_key = (x_hf_api_key or "").strip() or (env_key or "").strip()

    if not api_key:
        return {"optimized_prompt": data.prompt}

    try:
        client = InferenceClient(token=api_key)
        model_id = "Qwen/Qwen2.5-72B-Instruct"
        
        if data.language == "english":
            system_instruction = (
                "You are an expert prompt engineer and a professional fantasy story writer.\n"
                "Your task is to take a raw, brief story prompt or idea from the user and expand it into a highly detailed, descriptive, and structured prompt optimized for generating a rich fantasy/xianxia story.\n"
                "Strictly follow these rules:\n"
                "1. Output the optimized prompt in ENGLISH.\n"
                "2. The optimized prompt should detail: Setting/World Building, Main Character, Cheat/Unique ability, Main Conflict, and Writing Style (e.g. epic, mysterious, dramatic).\n"
                "3. Respond ONLY with the optimized prompt content. Do NOT include conversational filler, greetings, markdown headings like '# Optimized Prompt', or quotes around the prompt."
            )
        else:
            system_instruction = (
                "Bạn là một chuyên gia kỹ sư prompt (Prompt Engineer) và nhà văn chuyên viết truyện tiên hiệp, huyền ảo.\n"
                "Nhiệm vụ của bạn là nhận vào một ý tưởng hoặc prompt thô từ người dùng và mở rộng, tối ưu hóa nó thành một prompt chi tiết, phong phú, giàu tính miêu tả bằng tiếng Việt 100% để tạo ra một câu chuyện tu tiên huyền ảo, kịch tính.\n"
                "Hãy tuân thủ nghiêm ngặt các quy tắc sau:\n"
                "1. Viết prompt tối ưu hóa hoàn toàn bằng TIẾNG VIỆT tinh khiết. TUYỆT ĐỐI KHÔNG sử dụng chữ Hán (chữ Trung Quốc), tiếng Anh hay bất kỳ ngôn ngữ nào khác.\n"
                "2. Prompt tối ưu hóa cần bao gồm các chi tiết sinh động về: Bối cảnh huyền ảo, Thiết lập nhân vật chính (uy nghiêm, sâu sắc hoặc nghịch thiên), Cơ duyên/Bàn tay vàng, Mâu thuẫn/Xung đột chính và Văn phong kỳ ảo hoành tráng.\n"
                "3. Đầu ra CHỈ chứa duy nhất nội dung prompt đã được tối ưu hóa. KHÔNG thêm lời chào, lời dẫn, lời giải thích hay bất cứ văn bản trò chuyện nào khác. KHÔNG đặt trong dấu ngoặc kép."
            )
        
        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Ý tưởng thô: {data.prompt}"}
        ]
        
        response = client.chat_completion(
            model=model_id,
            messages=messages,
            max_tokens=1024,
            temperature=0.7
        )
        
        optimized = ""
        if response.choices:
            optimized = response.choices[0].message.content or ""
        
        optimized = optimized.strip()
        if optimized.startswith('"') and optimized.endswith('"'):
            optimized = optimized[1:-1].strip()
        elif optimized.startswith('“') and optimized.endswith('”'):
            optimized = optimized[1:-1].strip()
            
        if not optimized:
            raise ValueError("Empty response from AI")
            
        return {"optimized_prompt": optimized}
    except Exception as e:
        print(f"[WARN] Failed to optimize prompt via AI: {e}")
        return {"optimized_prompt": data.prompt}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Xóa 1 Project theo ID.
    Bắt buộc phải kiểm tra quyền sở hữu (ownership).
    """
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()

    # 1. Kiểm tra Project có tồn tại không
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")

    # 2. Quan Trọng: Kiểm tra quyền sở hữu trước khi xóa
    if getattr(project, "user_id", None) != getattr(current_user, "id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xóa Project này.")

    # Xóa bảng phụ thuộc project_id trước (an toàn kể cả khi FK trong DB chưa CASCADE).
    db.execute(delete(models.ProjectTeamToken).where(models.ProjectTeamToken.project_id == pid))
    db.execute(delete(models.ProjectContextEntry).where(models.ProjectContextEntry.project_id == pid))
    db.delete(project)
    db.commit()

    return None
