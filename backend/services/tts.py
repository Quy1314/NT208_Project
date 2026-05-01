import os
import time
from io import BytesIO
from typing import Iterable, Tuple

import requests
from pydub import AudioSegment

FPT_TTS_URL = "https://api.fpt.ai/hmi/tts/v5"


def _resolve_api_key(api_key: str | None) -> str:
    resolved = (api_key or "").strip() or (os.getenv("FPT_API_KEY") or "").strip()
    if not resolved:
        raise RuntimeError("Thiếu FPT API key. Hãy gửi header X-FPT-Api-Key hoặc cấu hình FPT_API_KEY.")
    return resolved


def _split_text_chunks(text: str, max_len: int = 1200) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return [""]
    if len(cleaned) <= max_len:
        return [cleaned]

    chunks: list[str] = []
    current = ""
    for line in cleaned.splitlines():
        candidate = f"{current}\n{line}".strip() if current else line
        if len(candidate) <= max_len:
            current = candidate
            continue
        if current:
            chunks.append(current)
        current = line
    if current:
        chunks.append(current)
    return chunks


def _request_tts_async_url(text: str, api_key: str, voice: str, speed: int, audio_format: str) -> str:
    headers = {
        "api-key": api_key,
        "voice": voice,
        "speed": str(speed),
        "format": audio_format,
    }
    res = requests.post(FPT_TTS_URL, data=text.encode("utf-8"), headers=headers, timeout=60)
    res.raise_for_status()
    payload = res.json()
    async_url = payload.get("async")
    if not async_url:
        raise RuntimeError(f"FPT TTS response không hợp lệ: {payload}")
    return async_url


def _poll_audio(async_url: str, timeout_seconds: float = 60.0) -> bytes:
    start = time.monotonic()
    delay = 0.8
    max_delay = 5.0

    while True:
        elapsed = time.monotonic() - start
        if elapsed > timeout_seconds:
            raise TimeoutError("FPT TTS timeout: audio chưa sẵn sàng trong 60 giây.")

        try:
            res = requests.get(async_url, timeout=30)
            if res.status_code == 200:
                return res.content
            if res.status_code not in (202, 404):
                raise RuntimeError(f"FPT async URL trả status {res.status_code}.")
        except requests.RequestException as exc:
            # Network glitches are retried until timeout.
            if (time.monotonic() - start) > timeout_seconds:
                raise RuntimeError(f"Lỗi kết nối khi poll FPT audio: {str(exc)}") from exc

        time.sleep(delay)
        delay = min(max_delay, delay * 1.7)


def _merge_audio_chunks(chunks: Iterable[bytes]) -> bytes:
    merged: AudioSegment | None = None
    for chunk in chunks:
        segment = AudioSegment.from_file(BytesIO(chunk))
        merged = segment if merged is None else merged + segment

    if merged is None:
        return b""

    out = BytesIO()
    merged.export(out, format="mp3", bitrate="128k")
    return out.getvalue()


def generate_tts_audio(
    text: str,
    api_key: str | None,
    voice: str = "leminh",
    speed: int = 0,
    audio_format: str = "mp3",
    timeout_seconds: float = 60.0,
) -> Tuple[bytes, str]:
    """
    Full async TTS flow:
    1) submit text -> async url
    2) poll with exponential backoff
    3) support long text by chunking then merging
    """
    resolved_api_key = _resolve_api_key(api_key)
    chunks = _split_text_chunks(text)
    audio_parts: list[bytes] = []

    for chunk in chunks:
        async_url = _request_tts_async_url(
            text=chunk,
            api_key=resolved_api_key,
            voice=voice,
            speed=speed,
            audio_format=audio_format,
        )
        audio_parts.append(_poll_audio(async_url, timeout_seconds=timeout_seconds))

    if len(audio_parts) == 1:
        return audio_parts[0], "mp3"
    return _merge_audio_chunks(audio_parts), "mp3"

