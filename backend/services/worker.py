import time
import traceback
from uuid import UUID

import models
from database import SessionLocal
from services.content.executor import execute_prompt_to_text
from services.content.planner import plan_audio_prompt
from services.tts import DEFAULT_VOICE, generate_tts_audio
from services.storage import upload_audio_to_storage


async def process_audio_job_async(ctx, job_id_str: str, fpt_api_key: str | None = None) -> None:
    print(f"[WORKER] Starting audio job task for job_id: {job_id_str}")
    db = SessionLocal()
    job_uuid = UUID(job_id_str)
    try:
        job = db.query(models.AudioJob).filter(models.AudioJob.id == job_uuid).first()
        if not job:
            print(f"[WORKER] Job {job_id_str} not found in database.")
            return

        job.status = "processing"
        job.error = None
        db.commit()

        print(f"[WORKER] Planning audio content for job: {job_id_str}")
        plan = plan_audio_prompt(prompt=job.prompt, language=job.language or "vietnamese")
        script = execute_prompt_to_text(plan=plan, prompt=job.prompt)
        if not script.strip():
            raise RuntimeError("Planner/Executor returned empty script.")

        print(f"[WORKER] Generating TTS audio via VieNeu service (length={len(script)})")
        voice = getattr(job, "voice", None) or DEFAULT_VOICE
        ref_audio_url = getattr(job, "ref_audio_url", None)
        audio_bytes, ext = generate_tts_audio(
            text=script,
            voice=voice,
            ref_audio_url=ref_audio_url,
            timeout_seconds=300.0,
        )
        if not audio_bytes:
            raise RuntimeError("TTS returned empty audio.")

        filename = f"audio_job_{job.id}_{int(time.time() * 1000)}.{ext}"
        print(f"[WORKER] Uploading audio bytes to storage as '{filename}'")
        storage_url = upload_audio_to_storage(audio_bytes, filename)

        job.result_path = storage_url
        job.status = "done"
        job.error = None
        db.commit()
        print(f"[WORKER] Job {job_id_str} completed successfully! URL: {storage_url}")
    except Exception as exc:
        db.rollback()
        print(f"[WORKER] Error processing job {job_id_str}: {exc}")
        traceback.print_exc()

        failed_job = db.query(models.AudioJob).filter(models.AudioJob.id == job_uuid).first()
        if failed_job:
            failed_job.status = "failed"
            failed_job.error = str(exc)[:2000]
            db.commit()
    finally:
        db.close()
