from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
import fal_client

load_dotenv()

router = APIRouter(prefix="/api/video", tags=["Video"])

class VideoRequest(BaseModel):
    prompt: str

@router.post("/generate")
async def generate_video(data: VideoRequest):
    try:
        result = fal_client.subscribe(
            "fal-ai/minimax/video-01",
            arguments={
                "prompt": data.prompt
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