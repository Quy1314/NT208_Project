import os
import time
from uuid import UUID

import models
from database import SessionLocal
from services.content.executor import execute_prompt_to_text
from services.content.planner import plan_audio_prompt
from services.tts import generate_tts_audio


def _get_audio_upload_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "audio"))


def _voice_for_language(language: str) -> str:
    return "leminh" if language == "vietnamese" else "banmai"


def process_audio_job(job_id: UUID, fpt_api_key: str | None = None) -> None:
    """
    Background worker for async audio jobs.
    """
    db = SessionLocal()
    try:
        job = db.query(models.AudioJob).filter(models.AudioJob.id == job_id).first()
        if not job:
            return

        job.status = "processing"
        job.error = None
        db.commit()

        plan = plan_audio_prompt(prompt=job.prompt, language=job.language or "vietnamese")
        script = execute_prompt_to_text(plan=plan, prompt=job.prompt)
        if not script.strip():
            raise RuntimeError("Planner/Executor trả về script rỗng.")

        voice = _voice_for_language(job.language or "vietnamese")
        audio_bytes, ext = generate_tts_audio(
            text=script,
            api_key=fpt_api_key,
            voice=voice,
            speed=0,
            audio_format="mp3",
            timeout_seconds=60.0,
        )
        if not audio_bytes:
            raise RuntimeError("TTS không trả về audio.")

        upload_dir = _get_audio_upload_dir()
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"audio_job_{job.id}_{int(time.time() * 1000)}.{ext}"
        result_path = os.path.join(upload_dir, filename)
        with open(result_path, "wb") as fp:
            fp.write(audio_bytes)

        job.result_path = result_path
        job.status = "done"
        job.error = None
        db.commit()
    except Exception as exc:
        db.rollback()
        failed_job = db.query(models.AudioJob).filter(models.AudioJob.id == job_id).first()
        if failed_job:
            failed_job.status = "failed"
            failed_job.error = str(exc)[:2000]
            db.commit()
    finally:
        db.close()

