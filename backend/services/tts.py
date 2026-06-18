import base64
import os
import time
from typing import Tuple

import httpx
import requests

VIENEU_SERVICE_URL = (
    os.getenv("VIENEU_TTS_SERVICE_URL", "https://kiwi-1106-vienue-tts.hf.space").strip().rstrip("/")
)

DEFAULT_VOICE = "Bình An"
DEFAULT_TIMEOUT = 180.0


def generate_tts_audio(
    text: str,
    api_key: str | None = None,
    voice: str = DEFAULT_VOICE,
    speed: int = 0,
    audio_format: str = "mp3",
    timeout_seconds: float = DEFAULT_TIMEOUT,
    ref_audio_url: str | None = None,
) -> Tuple[bytes, str]:
    """
    Gọi VieNeu-TTS service qua HTTP.
    api_key, speed, audio_format giữ lại để tương thích interface cũ nhưng không dùng.
    """
    text = (text or "").strip()
    if not text:
        return b"", "wav"

    # Pre-warm HF Space (đánh thức nếu đang sleep)
    try:
        requests.get(f"{VIENEU_SERVICE_URL}/health", timeout=10)
    except Exception:
        pass

    params = {"text": text, "voice": voice}
    if ref_audio_url:
        params["ref_audio_url"] = ref_audio_url

    try:
        resp = requests.post(
            f"{VIENEU_SERVICE_URL}/generate",
            params=params,
            timeout=timeout_seconds,
        )
        resp.raise_for_status()
        payload = resp.json()
        audio_b64 = payload.get("audio_b64", "")
        if not audio_b64:
            raise RuntimeError("VieNeu service không trả về audio_b64")
        audio_bytes = base64.b64decode(audio_b64)
        ext = payload.get("format", "wav")
        return audio_bytes, ext
    except requests.exceptions.Timeout:
        raise TimeoutError(f"VieNeu TTS timeout sau {timeout_seconds}s")
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(f"Không thể kết nối VieNeu TTS service: {VIENEU_SERVICE_URL}") from e
    except requests.exceptions.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        raise RuntimeError(f"VieNeu TTS service lỗi HTTP {e.response.status_code if e.response else '?'}: {detail[:200]}")
