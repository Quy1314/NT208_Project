from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.orm import Session
from typing import List
import os
import time
import json
import re
import socket
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv

import models
from database import get_db
from auth import get_current_user
from generation.story import generate_story_content

# Dung base prefix /api, module Story di theo subpath /story.
storyRouter = APIRouter(prefix="/api", tags=["Story"])

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


def _project_uuid(project_id: str | UUID) -> UUID:
    if isinstance(project_id, UUID):
        return project_id
    try:
        return UUID(str(project_id))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay Project.")


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
            f"Luot {idx}:\n"
            f"- Prompt: {entry.prompt}\n"
            f"- Noi dung da sinh: {entry.generated_content[:900]}"
        )
    return "\n\n".join(blocks)


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
        if len(vi_chars) >= 1:
            return True
    elif mode == "en-to-vi":
        if len(en_like_tokens) >= 40 and len(vi_chars) <= 1:
            return True
    return False


def _translate_text_via_hf(text: str, mode: str, api_key: str) -> str:
    if not text.strip():
        return text

    chunks = _split_text_chunks(text)
    translated_chunks: list[str] = []

    for chunk in chunks:
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
                        endpoint_body = {"inputs": mini, "options": {"wait_for_model": True}}
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
                translated_chunks.append(chunk)

    return "\n\n".join(translated_chunks)


@storyRouter.get("/story/", response_model=List[models.ProjectResponse])
def get_all_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).all()
    return [
        models.ProjectResponse(
            id=str(p.id),
            title=p.title,
            prompt=p.prompt,
            content=p.content,
        )
        for p in projects
    ]


@storyRouter.post("/story/", response_model=models.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data: models.ProjectCreateReq,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    generated_content = generate_story_content(
        title=data.title,
        instruction=data.prompt,
        language=data.language,
        model_name=data.model_name,
        hf_api_key=x_hf_api_key,
    )

    new_project = models.Project(
        user_id=current_user.id,
        title=data.title,
        prompt=data.prompt,
        content=generated_content,
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    db.add(
        models.ProjectContextEntry(
            project_id=new_project.id,
            prompt=data.prompt,
            language=data.language,
            generated_content=generated_content,
        )
    )
    db.commit()

    return models.ProjectResponse(
        id=str(new_project.id),
        title=new_project.title,
        prompt=new_project.prompt,
        content=new_project.content,
    )


@storyRouter.post("/story/translate-export", response_model=models.ExportTranslateResp)
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
            detail="Thieu Hugging Face API key.",
        )

    return models.ExportTranslateResp(
        title=_translate_text_via_hf(data.title, data.mode, api_key),
        prompt=_translate_text_via_hf(data.prompt, data.mode, api_key),
        content=_translate_text_via_hf(data.content, data.mode, api_key),
    )


@storyRouter.post("/story/{project_id}/continue", response_model=models.ProjectResponse)
def continue_project(
    project_id: str,
    data: models.ProjectContinueReq,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ban khong co quyen truy cap Project nay.")

    recent_context = _build_recent_context(db, pid)
    new_chunk = generate_story_content(
        title=project.title,
        instruction=data.prompt,
        previous_content=project.content or "",
        language=data.language,
        recent_context=recent_context,
        model_name=data.model_name,
        hf_api_key=x_hf_api_key,
    )

    project.prompt = data.prompt
    if project.content and project.content.strip():
        project.content = f"{project.content.rstrip()}\n\n---\n\n{new_chunk}"
    else:
        project.content = new_chunk

    db.commit()
    db.refresh(project)

    db.add(
        models.ProjectContextEntry(
            project_id=project.id,
            prompt=data.prompt,
            language=data.language,
            generated_content=new_chunk,
        )
    )
    db.commit()

    return models.ProjectResponse(
        id=str(project.id),
        title=project.title,
        prompt=project.prompt,
        content=project.content,
    )


@storyRouter.get("/story/{project_id}", response_model=models.ProjectResponse)
def get_project_by_id(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ban khong co quyen truy cap Project nay.")
    return models.ProjectResponse(
        id=str(project.id),
        title=project.title,
        prompt=project.prompt,
        content=project.content,
    )


@storyRouter.get("/story/{project_id}/contexts")
def get_project_contexts(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ban khong co quyen truy cap Project nay.")

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


@storyRouter.delete("/story/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pid = _project_uuid(project_id)
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khong tim thay Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ban khong co quyen xoa Project nay.")

    db.execute(delete(models.ProjectTeamToken).where(models.ProjectTeamToken.project_id == pid))
    db.execute(delete(models.ProjectContextEntry).where(models.ProjectContextEntry.project_id == pid))
    db.delete(project)
    db.commit()
    return None
