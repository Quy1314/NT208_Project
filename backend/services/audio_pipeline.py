import os
from io import BytesIO

from pydub import AudioSegment

from services.content.executor import execute_prompt_to_text
from services.content.planner import plan_audio_prompt
from services.tts import DEFAULT_VOICE, generate_tts_audio


def get_audio_upload_dir() -> str:
    if os.getenv("VERCEL"):
        return os.path.abspath(os.path.join("/tmp", "uploads", "audio"))
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "audio"))


def to_mp3_if_possible(audio_bytes: bytes) -> tuple[bytes, str]:
    try:
        stream = BytesIO(audio_bytes)
        seg = AudioSegment.from_file(stream)
        out = BytesIO()
        seg.export(out, format="mp3", bitrate="128k")
        return out.getvalue(), "mp3"
    except Exception:
        return audio_bytes, "wav"


def generate_audio_from_text(
    prompt: str,
    language: str,
    fpt_api_key: str | None = None,
    voice: str = DEFAULT_VOICE,
    ref_audio_url: str | None = None,
) -> bytes:
    plan = plan_audio_prompt(prompt=prompt, language=language)
    plan["task_type"] = "audio"
    plan["sub_type"] = "speech"
    script = execute_prompt_to_text(plan=plan, prompt=prompt)
    audio_bytes, _ = generate_tts_audio(
        text=script,
        voice=voice,
        ref_audio_url=ref_audio_url,
        timeout_seconds=120.0,
    )
    return audio_bytes
