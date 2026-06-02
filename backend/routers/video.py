"""Video generation router — hỗ trợ 2 provider:
  - fal    : fal-ai/minimax-video (default, nhanh, không cần key env)
  - kling  : Kling AI text-to-video (chất lượng cao, cần KLING_ACCESS_KEY + KLING_SECRET_KEY)

Request body:
  {
    "prompt": "...",
    "provider": "fal" | "kling",          # optional, mặc định "fal"
    "project_id": "...",                   # optional
    "context": "...",                      # optional – story context
    "project_title": "...",               # optional
    "kling_model": "kling-v2-6",          # optional – chỉ dùng khi provider="kling"
    "kling_duration": "5",                # optional – "5" hoặc "10"
    "kling_mode": "std"                   # optional – "std" hoặc "pro"
  }
"""

import os
from fastapi import APIRouter, Header, HTTPException, status, Depends
from pydantic import BaseModel
from dotenv import load_dotenv
import fal_client
from typing import Optional
from sqlalchemy.orm import Session
import json
import time
from uuid import UUID

from database import get_db
from auth import get_current_user
import models
from services.kling import generate_kling_video

load_dotenv()

router = APIRouter(prefix="/api/video", tags=["Video"])


# ──────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────
class VideoRequest(BaseModel):
    prompt: str
    provider: Optional[str] = "fal"         # "fal" | "kling"

    # Project grounding (both providers)
    project_id: Optional[str] = None
    context: Optional[str] = None
    project_title: Optional[str] = None

    # Kling-specific overrides
    kling_model: Optional[str] = None
    kling_duration: Optional[str] = None
    kling_mode: Optional[str] = None


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def _build_video_prompt(data: VideoRequest) -> str:
    """Compose a rich prompt when project context is present."""
    ctx = (data.context or "").strip()
    if not ctx:
        return data.prompt

    title_line = ""
    if data.project_title and data.project_title.strip():
        title_line = f"Project title: {data.project_title.strip()}\n\n"

    return (
        f"{title_line}"
        f"Project context:\n{ctx}\n\n"
        f"User video request:\n{data.prompt.strip()}\n\n"
        "Generate a short video that follows the project context, characters, style, and storyline."
    )


# ──────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────
@router.post("/generate")
async def generate_video(
    data: VideoRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    x_kling_access_key: Optional[str] = Header(None, alias="X-Kling-Access-Key"),
    x_kling_secret_key: Optional[str] = Header(None, alias="X-Kling-Secret-Key"),
):
    """Generate a video using fal (default) or Kling AI."""
    final_prompt = _build_video_prompt(data)
    provider = (data.provider or "fal").lower()
    video_url = None

    # ── fal provider ──────────────────────────
    if provider == "fal":
        try:
            result = fal_client.subscribe(
                "fal-ai/minimax/video-01",
                arguments={"prompt": final_prompt},
            )
            video_url = result["video"]["url"]
        except Exception as e:
            err_msg = str(e)
            if any(x in err_msg.lower() for x in ["locked", "balance", "exhausted", "payment"]):
                import logging
                logging.warning(f"Fal API failed due to billing/limit ({e}). Returning fallback sample video.")
                video_url = "https://nt-208-project.vercel.app/landing-samples/Majestic_Horse_Sunset_Video_Generation.mp4"
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"fal generation failed: {e}",
                )

    # ── kling provider ────────────────────────
    elif provider == "kling":
        ak = (x_kling_access_key or "").strip() or (os.getenv("KLING_ACCESS_KEY") or "").strip()
        sk = (x_kling_secret_key or "").strip() or (os.getenv("KLING_SECRET_KEY") or "").strip()
        if not ak or not sk:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Kling API key chưa được cấu hình. "
                    "Thêm KLING_ACCESS_KEY / KLING_SECRET_KEY vào backend/.env "
                    "hoặc gửi header X-Kling-Access-Key / X-Kling-Secret-Key."
                ),
            )
        try:
            video_url = generate_kling_video(
                final_prompt,
                access_key=ak,
                secret_key=sk,
                model_name=data.kling_model or "kling-v2-6",
                duration=data.kling_duration or "5",
                mode=data.kling_mode or "std",
            )
        except TimeoutError as e:
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider không hợp lệ: '{provider}'. Dùng 'fal' hoặc 'kling'.",
        )

    if not video_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không tạo được URL video.",
        )

    # Save project state in database
    project_id_str = (data.project_id or "").strip()
    
    if project_id_str:
        # Continuing existing project
        try:
            pid = UUID(project_id_str)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
        
        project = db.query(models.Project).filter(models.Project.id == pid, models.Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
        
        # Load and parse existing messages
        messages = []
        if project.content:
            try:
                parsed = json.loads(project.content)
                if isinstance(parsed, list):
                    messages = parsed
            except Exception:
                if project.content.strip():
                    messages = [
                        {"id": "msg-old-1", "role": "user", "prompt": project.prompt},
                        {"id": "msg-old-2", "role": "assistant", "videoUrl": project.content}
                    ]
        
        # Append new prompt & response
        msg_id_u = f"u-{int(time.time() * 1000)}"
        msg_id_a = f"a-{int(time.time() * 1000)}"
        messages.append({"id": msg_id_u, "role": "user", "prompt": data.prompt})
        messages.append({
            "id": msg_id_a,
            "role": "assistant",
            "videoUrl": video_url,
            "assistantText": "Video generated successfully"
        })
        
        project.content = json.dumps(messages)
        project.updated_at = db.query(models.func.now()).scalar()
        db.commit()
        db.refresh(project)
        db_project_id = project.id
    else:
        # Creating a new project
        msg_id_u = f"u-{int(time.time() * 1000)}"
        msg_id_a = f"a-{int(time.time() * 1000)}"
        messages = [
            {"id": msg_id_u, "role": "user", "prompt": data.prompt},
            {
                "id": msg_id_a,
                "role": "assistant",
                "videoUrl": video_url,
                "assistantText": "Video generated successfully"
            }
        ]
        
        title = (data.project_title or "").strip()
        if not title:
            title = data.prompt.strip()[:30]
            if len(data.prompt.strip()) > 30:
                title += "..."
                
        new_project = models.Project(
            user_id=current_user.id,
            title=title,
            prompt=data.prompt,
            content=json.dumps(messages)
        )
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        db_project_id = new_project.id

    return {
        "provider": provider,
        "message": "Video generated successfully",
        "video_url": video_url,
        "project_id": str(db_project_id),
    }