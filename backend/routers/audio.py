from fastapi import APIRouter, Depends, Header, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import requests
import time
from io import BytesIO
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from uuid import UUID
from pydub import AudioSegment

import models
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/audio", tags=["Audio"])


def _build_public_audio_url(audio_id: UUID) -> str:
    return f"/api/audio/file/{audio_id}"


def _tts_models_for_language(language: str) -> list[str]:
    if language == "vietnamese":
        return [
            "facebook/mms-tts-vie",
        ]
    return [
        "microsoft/speecht5_tts",
        "facebook/mms-tts-eng",
    ]


def _generate_audio_via_http(api_key: str, model: str, text: str) -> bytes:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": text,
        "options": {"wait_for_model": True},
    }
    endpoints = [
        f"https://router.huggingface.co/hf-inference/models/{model}",
        f"https://api-inference.huggingface.co/models/{model}",
    ]

    last_error = ""
    for endpoint in endpoints:
        for _ in range(3):
            try:
                res = requests.post(endpoint, json=payload, headers=headers, timeout=120)
                if res.ok and res.content:
                    return res.content
                try:
                    err = res.json()
                    err_msg = str(err.get("error", "")).strip()
                    estimated = err.get("estimated_time")
                    if res.status_code in (429, 503) or "loading" in err_msg.lower():
                        if isinstance(estimated, (int, float)):
                            time.sleep(max(1.0, float(estimated)))
                        else:
                            time.sleep(2.0)
                        continue
                    last_error = err_msg or f"HTTP {res.status_code}"
                    break
                except Exception:
                    last_error = f"HTTP {res.status_code}: {res.text[:200]}"
                    break
            except requests.RequestException as req_err:
                last_error = str(req_err)
                time.sleep(1.2)

    raise RuntimeError(last_error or "Không thể gọi Hugging Face TTS qua HTTP.")


def _to_mp3_if_possible(audio_bytes: bytes) -> tuple[bytes, str]:
    """
    Cố gắng convert WAV -> MP3. Nếu không convert được thì giữ nguyên WAV.
    Trả về (bytes, extension).
    """
    try:
        wav_stream = BytesIO(audio_bytes)
        seg = AudioSegment.from_file(wav_stream, format="wav")
        out = BytesIO()
        seg.export(out, format="mp3", bitrate="128k")
        return out.getvalue(), "mp3"
    except Exception:
        return audio_bytes, "wav"


def generate_audio_from_text(
    text: str,
    language: str = "vietnamese",
    voice: str = "female",
    hf_api_key: str | None = None,
) -> bytes:
    """
    Trả về bytes của file audio (WAV format).
    """
    try:
        from dotenv import find_dotenv
        load_dotenv(find_dotenv(), override=True)
        env_key = os.getenv("hf_key_read")
        api_key = (hf_api_key or "").strip() or (env_key or "").strip()
        if not api_key:
            raise HTTPException(status_code=500, detail="Hugging Face API Key chưa cấu hình.")

        model_candidates = _tts_models_for_language(language)
        errors: list[str] = []

        for model in model_candidates:
            try:
                client = InferenceClient(token=api_key)
                response = client.text_to_speech(text, model=model)
                if isinstance(response, bytes) and response:
                    return response
                if isinstance(response, dict):
                    audio_bytes = response.get("audio", b"")
                    if isinstance(audio_bytes, bytes) and audio_bytes:
                        return audio_bytes
                raise RuntimeError("Empty audio response from InferenceClient.")
            except Exception as client_err:
                errors.append(f"InferenceClient/{model}: {repr(client_err)}")
                try:
                    audio_bytes = _generate_audio_via_http(api_key, model, text)
                    if audio_bytes:
                        return audio_bytes
                except Exception as http_err:
                    errors.append(f"HTTP/{model}: {repr(http_err)}")

        compact = " | ".join(errors[-4:]) if errors else "Không có chi tiết lỗi."
        raise HTTPException(status_code=500, detail=f"Không thể generate audio từ text. {compact}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Lỗi khi generate audio ({type(e).__name__}): {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi generate audio: {repr(e)}")


@router.post("/generate", response_model=models.AudioResponse)
def generate_audio(
    data: models.AudioGenerateReq,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_hf_api_key: str | None = Header(None, alias="X-HF-Api-Key"),
):
    """
    Generate audio từ text của project.
    - project_id: ID của project
    - data.text: Text để convert thành audio
    - data.language: Ngôn ngữ
    - data.voice: Giọng đọc 
    """

    # Kiểm tra project 
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project không tồn tại hoặc không có quyền truy cập.")

    # Generate audio
    audio_bytes = generate_audio_from_text(
        data.text,
        data.language,
        data.voice,
        hf_api_key=x_hf_api_key,
    )

    # Cố gắng convert MP3 để đáp ứng mong đợi download/play mp3.
    stored_bytes, ext = _to_mp3_if_possible(audio_bytes)
    audio_filename = f"audio_{project_id}_{len(stored_bytes)}.{ext}"
    
    # Create uploads directory if it doesn't exist
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "audio")
    os.makedirs(upload_dir, exist_ok=True)
    
    audio_path = os.path.join(upload_dir, audio_filename)

    with open(audio_path, "wb") as f:
        f.write(stored_bytes)

    # Lưu metadata vào DB
    audio_file = models.AudioFile(
        project_id=project.id,
        title=f"Audio for {project.title}",
        audio_url=audio_path  # URL nếu upload cloud
    )
    db.add(audio_file)
    db.commit()
    db.refresh(audio_file)

    return models.AudioResponse(
        id=str(audio_file.id),
        project_id=str(audio_file.project_id),
        title=audio_file.title,
        audio_url=_build_public_audio_url(audio_file.id),
        created_at=audio_file.created_at.isoformat()
    )


@router.get("/project/{project_id}", response_model=list[models.AudioResponse])
def get_project_audio(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Lấy danh sách audio files của project.
    """
    # Kiểm tra quyền
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project không tồn tại hoặc không có quyền truy cập.")

    audio_files = db.query(models.AudioFile).filter(models.AudioFile.project_id == project_id).all()
    return [
        models.AudioResponse(
            id=str(af.id),
            project_id=str(af.project_id),
            title=af.title,
            audio_url=_build_public_audio_url(af.id),
            created_at=af.created_at.isoformat()
        ) for af in audio_files
    ]


@router.get("/file/{audio_id}")
def stream_audio_file(
    audio_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        aid = UUID(audio_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Audio không tồn tại.")

    audio_file = db.query(models.AudioFile).filter(models.AudioFile.id == aid).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio không tồn tại.")

    project = db.query(models.Project).filter(models.Project.id == audio_file.project_id).first()
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập audio này.")

    local_path = audio_file.audio_url
    if not local_path or not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file audio trên server.")

    return FileResponse(
        path=local_path,
        media_type="audio/mpeg" if local_path.endswith(".mp3") else "audio/wav",
        filename=os.path.basename(local_path),
    )