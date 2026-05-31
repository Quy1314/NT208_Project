from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session
from typing import Any, List, cast
import os
import time
import json
import base64
import io
import re
import socket
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from PIL import Image as PILImage

from pydantic import BaseModel # Kept existing

import models
from database import get_db
from services.audio_pipeline import generate_audio_from_text, get_audio_upload_dir, to_mp3_if_possible
from auth import get_current_user

from image_pipeline.pipeline import canon_engine_enabled, run_canon_image_pipeline
from retrieval.service import append_chunks_for_new_segment, ensure_canon_scope
from services.canon_queries import project_has_canon_characters
from story_engine.context_pack import build_story_context_pack

# Tạo Router cho group API liên quan đến Dự án, có prefix là /api/projects
router = APIRouter(prefix="/api/projects", tags=["Projects"])
FPT_TTS_MODEL = "fpt-ai-tts-v5"
# Text-to-image qua Hugging Face Inference (router); khớp dropdown frontend.
HF_IMAGE_MODELS = frozenset(
    {
        "black-forest-labs/FLUX.1-dev",
        "black-forest-labs/FLUX.1-schnell",
        "stabilityai/stable-diffusion-xl-base-1.0",
        "runwayml/stable-diffusion-v1-5",
        "Lykon/DreamShaper",
        "SG161222/Realistic_Vision_V6.0_B1_noVAE",
        "prompthero/openjourney",
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
            raise RuntimeError(f"API response is not a valid image. Details: {res.content[:200]}")

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



def generate_story_content(
    title: str,
    instruction: str,
    previous_content: str = "",
    language: str = "vietnamese",
    recent_context: str = "",
    model_name: str | None = None,
    hf_api_key: str | None = None,
    canon_context_pack: str | None = None,
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
        context_block = ""
        if canon_context_pack is not None and canon_context_pack.strip():
            context_block = canon_context_pack.strip() + "\n\n"
        elif language == "english":
            context_block = (
                "Context from previous content (keep continuity and consistency):\n"
                f"{previous_content[-2500:]}\n\n"
            ) if previous_content.strip() else ""
        else:
            if previous_content.strip():
                context_block = (
                    "Ngữ cảnh nội dung trước đó (hãy giữ mạch văn và logic nhất quán):\n"
                    f"{previous_content[-5000:]}\n\n"
                )
            if recent_context.strip():
                context_block += (
                    "Tóm tắt lịch sử các lượt trước (ưu tiên dùng để giữ continuity):\n"
                    f"{recent_context}\n\n"
                )

        language_label = "vietnamese" if language == "vietnamese" else "english"
        if language_label == "english":
            prompt = (
                f"Write the next part of this story in {language_label}.\n"
                f"Title: {title}\n"
                f"Current instruction: {instruction}\n\n"
                f"{context_block}"
                "New generated content:\n"
            )
            system_prompt = (
                "You are a creative fiction writer. "
                "Always respond in the selected language: english."
            )
        else:
            prompt = (
                f"Hãy viết tiếp nội dung truyện sáng tạo bằng {language_label}.\n"
                f"Tiêu đề: {title}\n"
                f"Yêu cầu hiện tại: {instruction}\n\n"
                f"{context_block}"
                "Ràng buộc bắt buộc:\n"
                "- Chỉ dùng tiếng Việt, tuyệt đối không chèn câu tiếng Anh.\n"
                "- Nếu có thuật ngữ riêng (Pokemon, Team Rocket, Gym), giữ nguyên tên riêng, còn lại viết tiếng Việt tự nhiên.\n"
                "- Không mâu thuẫn với các sự kiện đã có ở chương trước.\n\n"
                "Nội dung mới cần sinh:\n"
            )
            system_prompt = (
                "Bạn là nhà văn chuyên sáng tác truyện hư cấu. "
                "Luôn trả lời bằng đúng ngôn ngữ được chọn: vietnamese. "
                "Tuyệt đối không dùng tiếng Anh cho câu mô tả hoặc hội thoại."
            )

        max_retries = 15
        max_tokens_per_call = 4096
        max_continuations = 2  # Tối đa 2 lần nối tiếp nếu bị cắt

        for attempt in range(max_retries):
            try:
                messages = [
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {"role": "user", "content": prompt}
                ]

                response = client.chat_completion(
                    model=model_id,
                    messages=messages,
                    max_tokens=max_tokens_per_call,
                    temperature=0.7
                )

                if response and response.choices:
                    choice = response.choices[0]
                    generated_content = str(choice.message.content).strip()

                    # Auto-continue khi model bị cắt giữa chừng (finish_reason=="length")
                    finish_reason = getattr(choice, "finish_reason", None)
                    if finish_reason == "length" and generated_content:
                        cont_messages = list(messages) + [
                            {"role": "assistant", "content": generated_content},
                            {"role": "user", "content": "Hãy viết tiếp phần còn lại, bắt đầu ngay từ chỗ bạn dừng. Không lặp lại nội dung đã viết."}
                        ]
                        for _cont in range(max_continuations):
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
                                    if cont_finish != "length":
                                        break
                                    # Cập nhật messages cho lần continue tiếp
                                    cont_messages = list(messages) + [
                                        {"role": "assistant", "content": generated_content},
                                        {"role": "user", "content": "Hãy viết tiếp phần còn lại, bắt đầu ngay từ chỗ bạn dừng. Không lặp lại nội dung đã viết."}
                                    ]
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
    title: str,
    instruction: str,
    previous_content: str = "",
    language: str = "vietnamese",
    recent_context: str = "",
    model_name: str | None = None,
    hf_api_key: str | None = None,
    canon_context_pack: str | None = None,
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
        context_block = ""
        if canon_context_pack is not None and canon_context_pack.strip():
            context_block = canon_context_pack.strip() + "\n\n"
        elif language == "english":
            context_block = (
                "Context from previous content (keep continuity and consistency):\n"
                f"{previous_content[-2500:]}\n\n"
            ) if previous_content.strip() else ""
        else:
            if previous_content.strip():
                context_block = (
                    "Ngữ cảnh nội dung trước đó (hãy giữ mạch văn và logic nhất quán):\n"
                    f"{previous_content[-5000:]}\n\n"
                )
            if recent_context.strip():
                context_block += (
                    "Tóm tắt lịch sử các lượt trước (ưu tiên dùng để giữ continuity):\n"
                    f"{recent_context}\n\n"
                )

        language_label = "vietnamese" if language == "vietnamese" else "english"
        if language_label == "english":
            prompt = (
                f"Write the next part of this story in {language_label}.\n"
                f"Title: {title}\n"
                f"Current instruction: {instruction}\n\n"
                f"{context_block}"
                "New generated content:\n"
            )
            system_prompt = (
                "You are a creative fiction writer. "
                "Always respond in the selected language: english."
            )
        else:
            prompt = (
                f"Hãy viết tiếp nội dung truyện sáng tạo bằng {language_label}.\n"
                f"Tiêu đề: {title}\n"
                f"Yêu cầu hiện tại: {instruction}\n\n"
                f"{context_block}"
                "Ràng buộc bắt buộc:\n"
                "- Chỉ dùng tiếng Việt, tuyệt đối không chèn câu tiếng Anh.\n"
                "- Nếu có thuật ngữ riêng (Pokemon, Team Rocket, Gym), giữ nguyên tên riêng, còn lại viết tiếng Việt tự nhiên.\n"
                "- Không mâu thuẫn với các sự kiện đã có ở chương trước.\n\n"
                "Nội dung mới cần sinh:\n"
            )
            system_prompt = (
                "Bạn là nhà văn chuyên sáng tác truyện hư cấu. "
                "Luôn trả lời bằng đúng ngôn ngữ được chọn: vietnamese. "
                "Tuyệt đối không dùng tiếng Anh cho câu mô tả hoặc hội thoại."
            )

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {"role": "user", "content": prompt}
        ]

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
        last_error_detail = "Hugging Face translation failed."

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
                                last_error_detail = "Chất lượng dịch không ổn định, hệ thống sẽ thử lại."
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
                        last_error_detail = "Hugging Face trả response translation không hợp lệ."
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
                    last_error_detail = err_text or f"Hugging Face translation lỗi HTTP {e.code}."
                    break
                except URLError as e:
                    if attempt < max_retries - 1:
                        _sleep_seconds(1.5)
                        continue
                    last_error_detail = f"Không kết nối được Hugging Face: {str(e.reason)}"
                    break
                except (TimeoutError, socket.timeout):
                    if attempt < max_retries - 1:
                        _sleep_seconds(2.0)
                        continue
                    last_error_detail = "Hugging Face phản hồi quá chậm (timeout)."
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
                mini_error = "Hugging Face translation failed."
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
                                        mini_error = "Chất lượng dịch không ổn định."
                                        if attempt == 0:
                                            _sleep_seconds(0.8)
                                            continue
                                        break
                                    mini_results.append(candidate_text)
                                    mini_translated = True
                                    break
                        except (HTTPError, URLError, TimeoutError, socket.timeout) as e:
                            mini_error = str(e)
                            if attempt == 0:
                                _sleep_seconds(0.9)
                                continue
                    if mini_translated:
                        break

                if not mini_translated:
                    mini_ok = False
                    last_error_detail = mini_error
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
    x_fpt_api_key: str | None = Header(None, alias="X-FPT-Api-Key"),
):
    """
    API Tạo Project mới và sinh nội dung bằng Hugging Face Model (FrostAura).
    Bắt buộc có JWT Token.
    Optional: header X-HF-Api-Key — key HF tạm của user (không lưu server).
    """
    # Kiểm tra loại model: audio, image hoặc text LLM.
    audio_models = [FPT_TTS_MODEL]
    is_audio_model = data.model_name and data.model_name in audio_models
    is_image_model = bool(data.model_name and data.model_name in HF_IMAGE_MODELS)

    # 1. Tạo project trước để canon_scope / lore FK có project_id ổn định
    new_project = models.Project(
        user_id=current_user.id,
        title=data.title,
        prompt=data.prompt,
        content="",
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
        mid = (data.model_name or "").strip() or "runwayml/stable-diffusion-v1-5"
        if canon_engine_enabled() and project_has_canon_characters(db, pid):
            out, _meta = run_canon_image_pipeline(db, pid, data.prompt, mid, x_hf_api_key)
            generated_content = (
                out if out.startswith("data:image") else generate_image_content(data.prompt, data.model_name, x_hf_api_key)
            )
        else:
            generated_content = generate_image_content(
                instruction=data.prompt,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
            )
    else:
        scope = ensure_canon_scope(db, pid)
        pack = None
        if canon_engine_enabled():
            pack = build_story_context_pack(db, pid, data.prompt, x_hf_api_key, project_content="")
        
        if stream:
            def event_generator():
                yield f"event: init\ndata: {json.dumps({'id': str(pid)})}\n\n"
                generated_content = ""
                try:
                    for chunk in generate_story_content_stream(
                        title=data.title,
                        instruction=data.prompt,
                        previous_content="",
                        language=data.language,
                        model_name=data.model_name,
                        hf_api_key=x_hf_api_key,
                        canon_context_pack=pack,
                    ):
                        generated_content += chunk
                        yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"
                    
                    proj = db.query(models.Project).filter(models.Project.id == pid).first()
                    if proj:
                        cast(Any, proj).content = generated_content
                        db.commit()
                        db.refresh(proj)

                    db.add(
                        models.ProjectContextEntry(
                            project_id=pid,
                            prompt=data.prompt,
                            language=data.language,
                            generated_content=generated_content,
                        )
                    )
                    db.commit()

                    if canon_engine_enabled() and scope:
                        try:
                            append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), generated_content, x_hf_api_key)
                        except Exception as chunk_err:
                            print(f"[WARN] lore chunk append failed: {chunk_err}")
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
                title=data.title,
                instruction=data.prompt,
                language=data.language,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
                canon_context_pack=pack,
            )
            if canon_engine_enabled():
                try:
                    append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), generated_content, x_hf_api_key)
                except Exception as chunk_err:
                    print(f"[WARN] lore chunk append failed: {chunk_err}")

    if not stream:
        cast(Any, new_project).content = generated_content
        db.commit()
        db.refresh(new_project)

        db.add(
            models.ProjectContextEntry(
                project_id=pid,
                prompt=data.prompt,
                language=data.language,
                generated_content=generated_content,
            )
        )
        db.commit()

        # 3. Nếu là audio model, tự động generate audio từ content vừa sinh
        if is_audio_model:
            # Không để lỗi TTS làm fail toàn bộ thao tác tạo project.
            try:
                audio_bytes = generate_audio_from_text(
                    generated_content,
                    data.language,
                    fpt_api_key=x_fpt_api_key,
                )
                stored_bytes, ext = to_mp3_if_possible(audio_bytes)
                audio_filename = f"audio_{new_project.id}_{int(time.time() * 1000)}.{ext}"
                upload_dir = get_audio_upload_dir()
                audio_path = os.path.join(upload_dir, audio_filename)
                with open(audio_path, "wb") as f:
                    f.write(stored_bytes)
                    
                audio_web_path = f"/uploads/audio/{audio_filename}"
                new_project_obj = cast(Any, new_project)
                new_project_obj.content = f"{new_project_obj.content}\n\n---\n\n{audio_web_path}"
                
                entry = db.query(models.ProjectContextEntry).filter(models.ProjectContextEntry.project_id == pid).order_by(models.ProjectContextEntry.created_at.desc()).first()
                if entry:
                    cast(Any, entry).generated_content = new_project_obj.content

                audio_file = models.AudioFile(
                    project_id=new_project.id,
                    title=f"Audio for {new_project.title}",
                    audio_url=audio_web_path,
                )
                db.add(audio_file)
                db.commit()
            except Exception as audio_err:
                print(f"[WARN] TTS auto-generation failed for project {new_project.id}: {audio_err}")

    new_project_obj = cast(Any, new_project)
    return models.ProjectResponse(
        id=str(new_project_obj.id),
        title=str(new_project_obj.title),
        prompt=str(new_project_obj.prompt),
        content=str(new_project_obj.content)
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
    x_fpt_api_key: str | None = Header(None, alias="X-FPT-Api-Key"),
):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    recent_context = _build_recent_context(db, pid)
    audio_models = [FPT_TTS_MODEL]
    is_audio_model = data.model_name and data.model_name in audio_models
    is_image_model = bool(data.model_name and data.model_name in HF_IMAGE_MODELS)

    project_obj = cast(Any, project)
    project_content = str(project_obj.content or "")
    project_title = str(project_obj.title)

    if is_audio_model:
        new_chunk_text = _extract_tts_text(data.prompt)
        new_chunk = new_chunk_text
        try:
            audio_bytes = generate_audio_from_text(
                new_chunk_text,
                data.language,
                fpt_api_key=x_fpt_api_key,
            )
            stored_bytes, ext = to_mp3_if_possible(audio_bytes)
            audio_filename = f"audio_{pid}_{int(time.time() * 1000)}.{ext}"
            upload_dir = get_audio_upload_dir()
            os.makedirs(upload_dir, exist_ok=True)
            audio_path = os.path.join(upload_dir, audio_filename)
            with open(audio_path, "wb") as f:
                f.write(stored_bytes)
                
            audio_web_path = f"/uploads/audio/{audio_filename}"
            new_chunk = f"{new_chunk_text}\n\n---\n\n{audio_web_path}"

            audio_file = models.AudioFile(
                project_id=pid,
                title=f"Audio for {project_title}",
                audio_url=audio_web_path,
            )
            db.add(audio_file)
        except Exception as audio_err:
            print(f"[WARN] TTS auto-generation failed for project {pid}: {audio_err}")

    elif is_image_model:
        ensure_canon_scope(db, pid)
        mid = (data.model_name or "").strip() or "runwayml/stable-diffusion-v1-5"
        if canon_engine_enabled() and project_has_canon_characters(db, pid):
            out, _meta = run_canon_image_pipeline(db, pid, data.prompt, mid, x_hf_api_key)
            new_chunk = (
                out if out.startswith("data:image") else generate_image_content(data.prompt, data.model_name, x_hf_api_key)
            )
        else:
            new_chunk = generate_image_content(
                instruction=data.prompt,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
            )
    else:
        scope = ensure_canon_scope(db, pid)
        pack = None
        if canon_engine_enabled():
            pack = build_story_context_pack(db, pid, data.prompt, x_hf_api_key, project_content=project_content)
        
        if stream:
            def event_generator():
                yield f"event: init\ndata: {json.dumps({'id': str(pid)})}\n\n"
                new_chunk = ""
                try:
                    for chunk in generate_story_content_stream(
                        title=project_title,
                        instruction=data.prompt,
                        previous_content=project_content,
                        language=data.language,
                        recent_context="" if canon_engine_enabled() else recent_context,
                        model_name=data.model_name,
                        hf_api_key=x_hf_api_key,
                        canon_context_pack=pack if canon_engine_enabled() else None,
                    ):
                        new_chunk += chunk
                        yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"

                    user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
                    continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
                    
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

                    db.add(
                        models.ProjectContextEntry(
                            project_id=pid,
                            prompt=data.prompt,
                            language=data.language,
                            generated_content=new_chunk,
                        )
                    )
                    db.commit()

                    if canon_engine_enabled() and scope:
                        try:
                            append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), new_chunk, x_hf_api_key)
                        except Exception as chunk_err:
                            print(f"[WARN] lore chunk append failed: {chunk_err}")
                except Exception as stream_err:
                    print(f"[ERROR] Stream generator error: {stream_err}")
                    if new_chunk.strip():
                        user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
                        continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
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
                title=project_title,
                instruction=data.prompt,
                previous_content=project_content,
                language=data.language,
                recent_context="" if canon_engine_enabled() else recent_context,
                model_name=data.model_name,
                hf_api_key=x_hf_api_key,
                canon_context_pack=pack if canon_engine_enabled() else None,
            )
            if canon_engine_enabled():
                try:
                    append_chunks_for_new_segment(db, cast(UUID, cast(Any, scope).id), new_chunk, x_hf_api_key)
                except Exception as chunk_err:
                    print(f"[WARN] lore chunk append failed: {chunk_err}")

    if not stream:
        project_obj = cast(Any, project)
        user_prompt_chunk = f"[[USER_PROMPT]]\n{data.prompt.strip()}"
        continuation_chunk = f"{user_prompt_chunk}\n\n---\n\n{new_chunk}"
        if project_content and project_content.strip():
            project_obj.content = f"{project_content.rstrip()}\n\n---\n\n{continuation_chunk}"
        else:
            project_obj.content = continuation_chunk

        db.commit()
        db.refresh(project)

        db.add(
            models.ProjectContextEntry(
                project_id=cast(UUID, project_obj.id),
                prompt=data.prompt,
                language=data.language,
                generated_content=new_chunk,
            )
        )
        db.commit()

    project_obj = cast(Any, project)
    return models.ProjectResponse(
        id=str(project_obj.id),
        title=str(project_obj.title),
        prompt=str(project_obj.prompt),
        content=str(project_obj.content),
    )


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
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    project_obj = cast(Any, project)
    return models.ProjectResponse(
        id=str(project_obj.id),
        title=str(project_obj.title),
        prompt=str(project_obj.prompt),
        content=str(project_obj.content)
    )


@router.get("/{project_id}/contexts")
def get_project_contexts(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if project.user_id != current_user.id:
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
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xóa Project này.")

    # Xóa bảng phụ thuộc project_id trước (an toàn kể cả khi FK trong DB chưa CASCADE).
    db.execute(delete(models.ProjectTeamToken).where(models.ProjectTeamToken.project_id == pid))
    db.execute(delete(models.ProjectContextEntry).where(models.ProjectContextEntry.project_id == pid))
    db.delete(project)
    db.commit()

    return None
