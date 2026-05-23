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
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from dotenv import load_dotenv
import fal_client
from typing import Optional

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
    x_kling_access_key: Optional[str] = Header(None, alias="X-Kling-Access-Key"),
    x_kling_secret_key: Optional[str] = Header(None, alias="X-Kling-Secret-Key"),
):
    """Generate a video using fal (default) or Kling AI."""
    final_prompt = _build_video_prompt(data)
    provider = (data.provider or "fal").lower()

    # ── fal provider ──────────────────────────
    if provider == "fal":
        try:
            result = fal_client.subscribe(
                "fal-ai/minimax/video-01",
                arguments={"prompt": final_prompt},
            )
            video_url: str = result["video"]["url"]
            return {
                "provider": "fal",
                "message": "Video generated successfully",
                "video_url": video_url,
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"fal generation failed: {e}",
            )

    # ── kling provider ────────────────────────
    if provider == "kling":
        # Key resolution: header > env
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
            return {
                "provider": "kling",
                "message": "Video generated successfully",
                "video_url": video_url,
            }
        except TimeoutError as e:
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Provider không hợp lệ: '{provider}'. Dùng 'fal' hoặc 'kling'.",
    )