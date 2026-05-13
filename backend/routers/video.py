from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
import fal_client
from typing import Optional

load_dotenv()

router = APIRouter(prefix="/api/video", tags=["Video"])

class VideoRequest(BaseModel):
    prompt: str
    # Optional project grounding: merged into the model prompt so the clip aligns with story/world.
    project_id: Optional[str] = None
    context: Optional[str] = None
    project_title: Optional[str] = None

def _build_video_prompt(data: VideoRequest) -> str:
    """Compose fal prompt: when context is present, anchor the shot to project + user request."""
    ctx = (data.context or "").strip()
    if not ctx:
        return data.prompt

    title_line = ""
    if data.project_title and str(data.project_title).strip():
        title_line = f"Project title: {str(data.project_title).strip()}\n\n"

    return (
        f"{title_line}"
        f"Project context:\n{ctx}\n\n"
        f"User video request:\n{data.prompt.strip()}\n\n"
        "Generate a short video that follows the project context, characters, style, and storyline."
    )

@router.post("/generate")
async def generate_video(data: VideoRequest):
    try:
        final_prompt = _build_video_prompt(data)
        result = fal_client.subscribe(
            "fal-ai/minimax/video-01",
            arguments={
                "prompt": final_prompt
            },
        )

        video_url = result["video"]["url"]

        return {
            "message": "Video generated successfully",
            "video_url": video_url
        }

    except Exception as e:
        return {
            "error": str(e)
        }