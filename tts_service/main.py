"""VieNeu-TTS v3 Turbo Service — FastAPI + ONNX CPU"""
import base64
import hashlib
import logging
import os
import tempfile
import time
from io import BytesIO

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("vieneu-tts")

app = FastAPI(title="VieNeu-TTS Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_tts = None
WARM_UP_TEXT = "Xin chào"

PRESET_VOICES = [
    "Bình An", "Ngọc Linh", "Trúc Ly", "Mỹ Duyên",
    "Xuân Vĩnh", "Thái Sơn", "Gia Bảo", "Đức Trí", "Trọng Hữu", "Ngọc Lan",
]

@app.on_event("startup")
async def startup():
    global _tts
    logger.info("Downloading & loading VieNeu-TTS v3 Turbo model (ONNX CPU)...")
    t0 = time.monotonic()
    from vieneu import Vieneu
    _tts = Vieneu()
    _tts.infer(WARM_UP_TEXT, voice="Bình An")
    elapsed = time.monotonic() - t0
    logger.info(f"Model ready in {elapsed:.1f}s")


@app.get("/health")
def health():
    return {"status": "ok", "voices": PRESET_VOICES}


@app.post("/generate")
async def generate(
    text: str = Query(..., description="Nội dung văn bản tiếng Việt"),
    voice: str = Query("Bình An", description="Tên giọng có sẵn"),
    ref_audio_url: str | None = Query(None, description="URL file giọng mẫu để clone"),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    if voice not in PRESET_VOICES and not ref_audio_url:
        raise HTTPException(
            status_code=400,
            detail=f"voice must be one of {PRESET_VOICES} or provide ref_audio_url",
        )

    ref_path = None
    try:
        if ref_audio_url:
            logger.info(f"Downloading reference audio: {ref_audio_url[:80]}...")
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(ref_audio_url)
                r.raise_for_status()
            suffix = ".wav"
            if "mp3" in (ref_audio_url or "").lower():
                suffix = ".mp3"
            ref_fd, ref_path = tempfile.mkstemp(suffix=suffix)
            os.write(ref_fd, r.content)
            os.close(ref_fd)

        logger.info(f"Generating TTS: text={text[:60]}... voice={voice} clone={ref_path is not None}")
        t0 = time.monotonic()
        audio_bytes = _tts.infer(text, voice=voice, ref_audio=ref_path)
        elapsed = time.monotonic() - t0
        logger.info(f"Generated {len(audio_bytes)} bytes in {elapsed:.1f}s")

        audio_b64 = base64.b64encode(audio_bytes).decode()
        return {"audio_b64": audio_b64, "format": "wav", "length_bytes": len(audio_bytes), "time_s": round(elapsed, 2)}
    finally:
        if ref_path and os.path.exists(ref_path):
            os.unlink(ref_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
