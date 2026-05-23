"""Kling AI text-to-video service.

Authentication: JWT signed with HS256 using KLING_ACCESS_KEY / KLING_SECRET_KEY.
Pattern: POST task → poll until succeeded → return video URL.
"""

import os
import time
import jwt  # PyJWT
import requests

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
KLING_API_BASE = "https://api-singapore.klingai.com"
_DEFAULT_MODEL = "kling-v2-6"
_DEFAULT_DURATION = "5"
_DEFAULT_MODE = "std"       # "std" or "pro"
_POLL_INTERVAL = 8          # seconds between status checks
_POLL_TIMEOUT = 300         # seconds total wait


def _make_jwt(access_key: str, secret_key: str) -> str:
    """Generate a short-lived JWT for Kling API (valid 30 min)."""
    now = int(time.time())
    payload = {
        "iss": access_key,
        "exp": now + 1800,
        "nbf": now - 5,
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")


def _headers(access_key: str, secret_key: str) -> dict:
    token = _make_jwt(access_key, secret_key)
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def generate_kling_video(
    prompt: str,
    *,
    access_key: str | None = None,
    secret_key: str | None = None,
    model_name: str = _DEFAULT_MODEL,
    duration: str = _DEFAULT_DURATION,
    mode: str = _DEFAULT_MODE,
) -> str:
    """Submit a text-to-video task to Kling AI and block until the video URL is ready.

    Falls back to env vars KLING_ACCESS_KEY / KLING_SECRET_KEY if not passed.

    Returns:
        str: Public video URL (valid ~24 h).

    Raises:
        RuntimeError: on missing keys, API errors, or timeout.
    """
    ak = (access_key or "").strip() or (os.getenv("KLING_ACCESS_KEY") or "").strip()
    sk = (secret_key or "").strip() or (os.getenv("KLING_SECRET_KEY") or "").strip()
    if not ak or not sk:
        raise RuntimeError(
            "Thiếu Kling API key. Hãy cấu hình KLING_ACCESS_KEY và KLING_SECRET_KEY "
            "trong backend/.env hoặc gửi header X-Kling-Access-Key / X-Kling-Secret-Key."
        )

    hdrs = _headers(ak, sk)

    # 1. Submit task
    payload = {
        "model_name": model_name,
        "prompt": prompt,
        "duration": duration,
        "mode": mode,
    }
    resp = requests.post(
        f"{KLING_API_BASE}/v1/videos/text2video",
        json=payload,
        headers=hdrs,
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()

    # Kling wraps results in {"code": 0, "data": {...}}
    if body.get("code") != 0:
        raise RuntimeError(f"Kling submit error: {body.get('message', body)}")

    task_id: str = body["data"]["task_id"]

    # 2. Poll until done
    deadline = time.time() + _POLL_TIMEOUT
    while time.time() < deadline:
        time.sleep(_POLL_INTERVAL)

        # Refresh JWT on every poll (token lives 30 min but let's be safe)
        poll_hdrs = _headers(ak, sk)
        status_resp = requests.get(
            f"{KLING_API_BASE}/v1/videos/text2video/{task_id}",
            headers=poll_hdrs,
            timeout=20,
        )
        status_resp.raise_for_status()
        status_body = status_resp.json()

        if status_body.get("code") != 0:
            raise RuntimeError(f"Kling poll error: {status_body.get('message', status_body)}")

        task_status: str = status_body["data"]["task_status"]

        if task_status == "succeed":
            videos: list = status_body["data"].get("task_result", {}).get("videos", [])
            if not videos:
                raise RuntimeError("Kling: task succeeded nhưng không có video URL.")
            return videos[0]["url"]

        if task_status == "failed":
            raise RuntimeError(
                f"Kling: task thất bại — {status_body['data'].get('task_status_msg', 'unknown')}"
            )

        # task_status in ("submitted", "processing") → keep polling

    raise TimeoutError(f"Kling: video chưa xong sau {_POLL_TIMEOUT}s (task_id={task_id}).")
