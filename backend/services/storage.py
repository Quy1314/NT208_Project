import os
import requests
from pathlib import Path

def get_audio_upload_dir() -> Path:
    if os.getenv("VERCEL"):
        return Path("/tmp") / "uploads" / "audio"
    return Path(__file__).resolve().parents[2] / "uploads" / "audio"


def get_signed_url(bucket: str, filename: str, expires_in: int = 3600) -> str | None:
    """
    Sinh signed URL động cho tệp tin trong bucket private của Supabase Storage.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        return None

    supabase_url = supabase_url.strip().rstrip("/")
    sign_url = f"{supabase_url}/storage/v1/object/sign/{bucket}/{filename}"
    headers = {
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(sign_url, json={"expiresIn": expires_in}, headers=headers, timeout=15)
        if response.status_code == 200:
            payload = response.json()
            # Trả về URL tương đối / absolute
            url_path = payload.get("signedURL") or payload.get("url")
            if url_path:
                if url_path.startswith("http"):
                    return url_path
                return f"{supabase_url}{url_path}"
        print(f"[STORAGE] Failed to sign URL. Status: {response.status_code}, Body: {response.text}")
    except Exception as e:
        print(f"[STORAGE] Exception signing URL: {e}")
    return None


def upload_audio_to_storage(file_bytes: bytes, filename: str) -> str:
    """
    Tải file audio lên hệ thống lưu trữ (Supabase Storage hoặc Local Fallback).
    Trả về URL tải file công khai hoặc đường dẫn lưu trữ nội bộ (đối với private/local).
    """
    storage_backend = os.getenv("STORAGE_BACKEND", "supabase").strip().lower()
    is_prod = os.getenv("ENV") == "production"
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    bucket = os.getenv("SUPABASE_BUCKET_NAME", "audio-outputs").strip()
    is_private = os.getenv("SUPABASE_STORAGE_IS_PRIVATE", "false").strip().lower() == "true"
    
    # 1. Nếu cấu hình Supabase hợp lệ và sử dụng Supabase Backend
    if storage_backend == "supabase" and supabase_url and supabase_key:
        supabase_url = supabase_url.strip().rstrip("/")
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{filename}"
        headers = {
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "audio/mpeg"
        }
        
        try:
            # Upload file lên Supabase bucket
            response = requests.post(upload_url, data=file_bytes, headers=headers, timeout=30)
            if response.status_code == 200:
                print(f"[STORAGE] Successfully uploaded '{filename}' to Supabase bucket '{bucket}'")
                
                # Nếu là bucket public, trả về URL truy cập trực tiếp
                if not is_private:
                    return f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"
                
                # Nếu là bucket private, lưu dạng định danh 'private://{bucket}/{filename}'
                # Khi client request, backend router sẽ giải mã và sinh signed URL động
                return f"private://{bucket}/{filename}"
            else:
                err_msg = f"Supabase Storage returned status {response.status_code}: {response.text}"
                print(f"[STORAGE] {err_msg}")
                if is_prod:
                    raise RuntimeError(err_msg)
        except Exception as e:
            print(f"[STORAGE] Exception during Supabase upload: {e}")
            if is_prod:
                raise
                
    # 2. Xử lý fallback ở Production (Báo lỗi to, không ghi đĩa)
    if is_prod:
        raise RuntimeError(
            f"Storage upload failed. STORAGE_BACKEND={storage_backend}. "
            "Local file fallback is disabled in production environment to prevent data loss."
        )

    # 3. Fallback lưu local ở Development
    print(f"[STORAGE] Fallback: Saving '{filename}' to local disk (development mode)")
    upload_dir = get_audio_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    local_path = upload_dir / filename
    with open(local_path, "wb") as f:
        f.write(file_bytes)
        
    return str(local_path)
