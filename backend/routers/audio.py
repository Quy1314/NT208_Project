import os
import time
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from services.audio_pipeline import generate_audio_from_text, get_audio_upload_dir, to_mp3_if_possible
from services.storage import get_signed_url
from arq_app import get_redis_pool

router = APIRouter(prefix="/api/audio", tags=["Audio"])


def _build_public_audio_url(audio_id: UUID) -> str:
    return f"/api/audio/file/{audio_id}"


def _safe_uuid(value: str, message: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc


def run_audio_job_sync_fallback(job_id: UUID, fpt_api_key: str | None):
    import asyncio
    from services.worker import process_audio_job_async
    # Chạy task async trong môi trường sync fallback của BackgroundTasks
    asyncio.run(process_audio_job_async(None, str(job_id), fpt_api_key))


@router.post("/jobs", response_model=models.AudioJobCreateResp, status_code=status.HTTP_202_ACCEPTED)
async def create_audio_job(
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

    use_async_worker = os.getenv("USE_ASYNC_AUDIO_WORKER", "true").lower() == "true"
    
    if use_async_worker:
        try:
            redis = await get_redis_pool()
            await redis.enqueue_job('process_audio_job_async', str(job.id), x_fpt_api_key)
            print(f"[API] Audio job {job.id} enqueued to ARQ Redis worker.")
        except Exception as e:
            print(f"[API] Failed to enqueue to Redis worker: {e}")
            if os.getenv("ENV") == "production":
                db.delete(job)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Không thể xếp hàng tác vụ trên production (Lỗi kết nối Redis)."
                ) from e
            # Fallback chạy nền sync bằng BackgroundTasks ở local dev
            print("[API] Falling back to sync FastAPI background task.")
            background_tasks.add_task(run_audio_job_sync_fallback, job.id, x_fpt_api_key)
    else:
        background_tasks.add_task(run_audio_job_sync_fallback, job.id, x_fpt_api_key)
        
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

    audio_url = None
    if job.status == "done" and job.result_path:
        path = job.result_path
        if path.startswith("private://"):
            bucket, filename = path[10:].split("/", 1)
            audio_url = get_signed_url(bucket, filename)
        elif path.startswith("http://") or path.startswith("https://"):
            audio_url = path
        else:
            audio_url = _build_public_audio_url(job.id)

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
        
        path = audio_job.result_path
        
        # Nếu lưu dạng private://, sinh signed URL và redirect client
        if path.startswith("private://"):
            bucket, filename = path[10:].split("/", 1)
            signed_url = get_signed_url(bucket, filename)
            if not signed_url:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không thể tạo liên kết tải file.")
            return RedirectResponse(url=signed_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
            
        # Nếu lưu dạng http/https, redirect trực tiếp
        if path.startswith("http://") or path.startswith("https://"):
            return RedirectResponse(url=path, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

        # Fallback local file
        if not os.path.exists(path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file audio trên server.")

        media_type = "audio/mpeg" if path.lower().endswith(".mp3") else "audio/wav"
        return FileResponse(
            path=path,
            media_type=media_type,
            filename=os.path.basename(path),
        )

    audio_file = db.query(models.AudioFile).filter(models.AudioFile.id == jid).first()
    if not audio_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio không tồn tại.")
    if not audio_file.audio_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file audio trên server.")
        
    path = audio_file.audio_url
    if path.startswith("http://") or path.startswith("https://") or path.startswith("private://"):
        if path.startswith("private://"):
            bucket, filename = path[10:].split("/", 1)
            signed_url = get_signed_url(bucket, filename)
            if not signed_url:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không thể tạo liên kết tải file.")
            return RedirectResponse(url=signed_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        return RedirectResponse(url=path, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    if not os.path.exists(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file audio trên server.")

    media_type = "audio/mpeg" if path.lower().endswith(".mp3") else "audio/wav"
    return FileResponse(
        path=path,
        media_type=media_type,
        filename=os.path.basename(path),
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