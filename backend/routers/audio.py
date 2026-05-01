import os
import time
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from services.audio_pipeline import generate_audio_from_text, get_audio_upload_dir, to_mp3_if_possible
from services.worker import process_audio_job

router = APIRouter(prefix="/api/audio", tags=["Audio"])


def _build_public_audio_url(audio_id: UUID) -> str:
    return f"/api/audio/file/{audio_id}"


def _safe_uuid(value: str, message: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc


@router.post("/jobs", response_model=models.AudioJobCreateResp, status_code=status.HTTP_202_ACCEPTED)
def create_audio_job(
    data: models.AudioJobCreateReq,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_fpt_api_key: str | None = Header(None, alias="X-FPT-Api-Key"),
):
    """
    Create async audio job and return immediately.
    """
    if not x_fpt_api_key and not os.getenv("FPT_API_KEY"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cần FPT TTS API key trong header X-FPT-Api-Key hoặc biến môi trường FPT_API_KEY.",
        )

    prompt = (data.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt không được để trống.")

    job = models.AudioJob(
        user_id=current_user.id,
        prompt=prompt,
        language=data.language,
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(process_audio_job, job.id, x_fpt_api_key)
    return models.AudioJobCreateResp(job_id=str(job.id), status="queued")


@router.get("/jobs/{job_id}", response_model=models.AudioJobStatusResp)
def get_audio_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Poll audio job status.
    """
    jid = _safe_uuid(job_id, "Audio job không tồn tại.")
    job = (
        db.query(models.AudioJob)
        .filter(models.AudioJob.id == jid, models.AudioJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job không tồn tại.")

    audio_url = _build_public_audio_url(job.id) if job.status == "done" and job.result_path else None
    return models.AudioJobStatusResp(
        job_id=str(job.id),
        status=job.status,
        audio_url=audio_url,
        error=job.error,
        created_at=job.created_at.isoformat(),
    )


@router.get("/file/{job_id}")
def stream_audio_file(job_id: str, db: Session = Depends(get_db)):
    """
    Stream generated audio by audio job id.
    Backward-compatible fallback: if job_id is an old AudioFile id, still stream it.
    """
    jid = _safe_uuid(job_id, "Audio không tồn tại.")

    audio_job = db.query(models.AudioJob).filter(models.AudioJob.id == jid).first()
    if audio_job:
        if audio_job.status != "done" or not audio_job.result_path:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Audio chưa sẵn sàng. Trạng thái hiện tại: {audio_job.status}.",
            )
        if not os.path.exists(audio_job.result_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file audio trên server.")

        media_type = "audio/mpeg" if audio_job.result_path.lower().endswith(".mp3") else "audio/wav"
        return FileResponse(
            path=audio_job.result_path,
            media_type=media_type,
            filename=os.path.basename(audio_job.result_path),
        )

    audio_file = db.query(models.AudioFile).filter(models.AudioFile.id == jid).first()
    if not audio_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio không tồn tại.")
    if not audio_file.audio_url or not os.path.exists(audio_file.audio_url):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file audio trên server.")

    media_type = "audio/mpeg" if audio_file.audio_url.lower().endswith(".mp3") else "audio/wav"
    return FileResponse(
        path=audio_file.audio_url,
        media_type=media_type,
        filename=os.path.basename(audio_file.audio_url),
    )


@router.post("/generate", response_model=models.AudioResponse)
def generate_audio_legacy(
    data: models.AudioGenerateReq,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_fpt_api_key: str | None = Header(None, alias="X-FPT-Api-Key"),
):
    """
    Legacy sync endpoint kept for existing frontend compatibility.
    """
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project không tồn tại hoặc không có quyền truy cập.")
    if not x_fpt_api_key and not os.getenv("FPT_API_KEY"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cần FPT TTS API key trong header X-FPT-Api-Key")

    audio_bytes = generate_audio_from_text(prompt=data.prompt, language=data.language, fpt_api_key=x_fpt_api_key)
    stored_bytes, ext = to_mp3_if_possible(audio_bytes)
    audio_filename = f"audio_{project_id}_{int(time.time() * 1000)}.{ext}"

    upload_dir = get_audio_upload_dir()
    os.makedirs(upload_dir, exist_ok=True)
    audio_path = os.path.join(upload_dir, audio_filename)
    with open(audio_path, "wb") as fp:
        fp.write(stored_bytes)

    audio_file = models.AudioFile(project_id=project.id, title=f"Audio for {project.title}", audio_url=audio_path)
    db.add(audio_file)
    db.commit()
    db.refresh(audio_file)

    return models.AudioResponse(
        id=str(audio_file.id),
        project_id=str(audio_file.project_id),
        title=audio_file.title,
        audio_url=_build_public_audio_url(audio_file.id),
        created_at=audio_file.created_at.isoformat(),
    )


@router.get("/project/{project_id}", response_model=list[models.AudioResponse])
def get_project_audio(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project không tồn tại hoặc không có quyền truy cập.")

    audio_files = db.query(models.AudioFile).filter(models.AudioFile.project_id == project_id).all()
    return [
        models.AudioResponse(
            id=str(af.id),
            project_id=str(af.project_id),
            title=af.title,
            audio_url=_build_public_audio_url(af.id),
            created_at=af.created_at.isoformat(),
        )
        for af in audio_files
    ]