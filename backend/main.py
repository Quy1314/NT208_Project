import warnings
# Suppress pydub runtime warnings about ffmpeg/avconv in serverless environment
warnings.filterwarnings("ignore", category=RuntimeWarning, message="Couldn't find ffmpeg or avconv")

import traceback
import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse

# Định nghĩa check lifespan lúc khởi động server
@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("ENV") == "production":
        jwt_secret = os.getenv("JWT_SECRET_KEY")
        if not jwt_secret or jwt_secret.strip() == "" or jwt_secret.strip().lower() == "secret":
            print("CRITICAL SECURITY ERROR: JWT_SECRET_KEY must be set to a secure value in production!")
            raise RuntimeError("Startup blocked: Insecure or missing JWT_SECRET_KEY on production.")
    yield

# Khởi tạo application FastAPI chính ở ngoài cùng (indentation level 0) để Vercel build parser nhận diện được
app = FastAPI(lifespan=lifespan)

try:
    from dotenv import load_dotenv
    load_dotenv()

    from collections import defaultdict, deque
    from datetime import datetime, timedelta, timezone
    from pathlib import Path

    BACKEND_DIR = Path(__file__).resolve().parent
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from fastapi import Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from sqlalchemy import text

    from database import engine, Base
    import models
    import lore.db_models  # noqa: F401
    import auth
    from routers import projects, teams, audio, canon, video, prompt_templates

    # Không tự tạo bảng khi import app trên production/serverless.
    if os.getenv("AUTO_CREATE_TABLES", "false").lower() == "true":
        Base.metadata.create_all(bind=engine)

    # Vercel Serverless chỉ cho ghi file tạm trong /tmp; bundle /var/task là read-only.
    def _runtime_dir(name: str) -> Path:
        if os.getenv("VERCEL"):
            return Path("/tmp") / name
        return Path(name)

    OUTPUTS_DIR = _runtime_dir("outputs")
    UPLOADS_DIR = _runtime_dir("uploads")

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / "audio").mkdir(parents=True, exist_ok=True)

    app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://nt-208-projectfrontend.vercel.app",
            "https://nt-208-project.vercel.app",
        ],
        allow_origin_regex=r"https://nt-208-project(frontend)?-[a-z0-9-]+-quy1314s-projects\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    WINDOW_SECONDS = 5
    MAX_REQUESTS_IN_WINDOW = 10
    BLOCK_SECONDS = 300
    request_windows = defaultdict(deque)
    blocked_until = {}

    @app.middleware("http")
    async def anti_spam_middleware(request: Request, call_next):
        if not request.url.path.startswith("/api/") or request.method in {"GET", "OPTIONS", "HEAD"}:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now(timezone.utc)

        block_expiry = blocked_until.get(client_ip)
        if block_expiry and now < block_expiry:
            retry_after = int((block_expiry - now).total_seconds())
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Bạn gửi request quá nhanh. Vui lòng thử lại sau.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        if block_expiry and now >= block_expiry:
            blocked_until.pop(client_ip, None)

        window = request_windows[client_ip]
        cutoff = now - timedelta(seconds=WINDOW_SECONDS)

        while window and window[0] < cutoff:
            window.popleft()

        window.append(now)

        if len(window) > MAX_REQUESTS_IN_WINDOW:
            blocked_until[client_ip] = now + timedelta(seconds=BLOCK_SECONDS)
            request_windows[client_ip].clear()
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Phát hiện spam request. Tài khoản/IP này bị chặn trong 5 phút.",
                    "retry_after_seconds": BLOCK_SECONDS,
                },
                headers={"Retry-After": str(BLOCK_SECONDS)},
            )

        return await call_next(request)

    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(canon.router)
    app.include_router(teams.router)
    app.include_router(audio.router)
    app.include_router(video.router)
    app.include_router(prompt_templates.router)

    @app.get("/")
    def read_root():
        return {"message": "Welcome to the AI Content Generator API"}

    @app.get("/test-db")
    def test_db():
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                return {
                    "message": "Database connection successful",
                    "result": result.scalar(),
                }
        except Exception as e:
            return {"message": "Database connection failed", "error": str(e)}

    @app.get("/test-storage")
    def test_storage():
        import requests
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
        bucket = os.getenv("SUPABASE_BUCKET_NAME", "audio-outputs").strip()
        
        if not supabase_url or not supabase_key:
            return {
                "status": "FAIL",
                "message": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.",
                "supabase_url": supabase_url,
                "supabase_key_present": bool(supabase_key)
            }
            
        dummy_data = b"Production connection test file"
        filename = "production_test_upload.txt"
        supabase_url = supabase_url.strip().rstrip("/")
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{filename}"
        
        headers = {
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "text/plain",
            "x-upsert": "true"
        }
        
        try:
            response = requests.post(upload_url, data=dummy_data, headers=headers, timeout=15)
            if response.status_code == 200:
                return {
                    "status": "SUCCESS",
                    "message": f"Successfully uploaded test file to Supabase bucket '{bucket}' from Vercel production!",
                    "public_url": f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"
                }
            else:
                return {
                    "status": "FAIL",
                    "message": f"Supabase Storage returned HTTP {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "ERROR",
                "message": str(e)
            }

    def ping_redis_socket(redis_url: str) -> dict:
        import socket
        import ssl
        from urllib.parse import urlparse
        try:
            if not redis_url:
                return {"status": "SKIPPED", "message": "No Redis URL provided"}
                
            parsed = urlparse(redis_url)
            host = parsed.hostname or "127.0.0.1"
            port = parsed.port or 6379
            password = parsed.password
            
            # Setup socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            
            if parsed.scheme == "rediss":
                context = ssl.create_default_context()
                sock = context.wrap_socket(sock, server_hostname=host)
                
            sock.connect((host, port))
            
            # Authenticate if password exists
            if password:
                sock.sendall(f"AUTH {password}\r\n".encode())
                auth_resp = sock.recv(1024).decode()
                
            # Send PING
            sock.sendall(b"PING\r\n")
            resp = sock.recv(1024).decode()
            sock.close()
            
            if "PONG" in resp:
                return {"status": "SUCCESS", "message": "Redis ping successful (PONG)"}
            else:
                return {"status": "FAIL", "message": f"Redis did not return PONG. Response: {resp[:100]}"}
        except Exception as e:
            return {"status": "ERROR", "message": str(e)}

    @app.get("/api/cron/ping")
    async def cron_ping(request: Request):
        # Allow running in development or if header X-Vercel-Cron is present
        is_vercel_cron = request.headers.get("x-vercel-cron") == "1"
        is_dev = os.getenv("ENV") != "production"
        
        if not is_vercel_cron and not is_dev:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: This endpoint is only callable by Vercel scheduler or in development mode."}
            )
            
        # Ping Supabase DB
        db_status = "UNKNOWN"
        db_message = ""
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                if result.scalar() == 1:
                    db_status = "SUCCESS"
                    db_message = "Supabase DB connection successful"
                else:
                    db_status = "FAIL"
                    db_message = "Supabase DB query did not return expected value"
        except Exception as e:
            db_status = "ERROR"
            db_message = str(e)
            
        # Ping Redis
        redis_url = os.getenv("REDIS_URL") or os.getenv("KV_URL")
        redis_result = ping_redis_socket(redis_url)
        
        # Overall status
        overall_success = (db_status == "SUCCESS") and (redis_result["status"] in ["SUCCESS", "SKIPPED"])
        
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "overall_status": "SUCCESS" if overall_success else "FAIL",
            "services": {
                "supabase_db": {
                    "status": db_status,
                    "message": db_message
                },
                "redis": redis_result
            }
        }

except BaseException as err:
    # Lưu vết lỗi vào biến toàn cục để tránh NameError khi gọi API sau khi khối except đã kết thúc
    startup_error_str = str(err)
    startup_error_traceback = traceback.format_exc()

    @app.get("/{path:path}")
    def fallback(path: str):
        safe_env = {}
        for k, v in os.environ.items():
            if any(secret_kw in k.upper() for secret_kw in ["KEY", "SECRET", "PASSWORD", "URL", "TOKEN"]):
                safe_env[k] = f"*** (len={len(v)})" if v else "None/Empty"
            else:
                safe_env[k] = v
        return JSONResponse(
            status_code=500,
            content={
                "error": "Startup failed",
                "detail": startup_error_str,
                "traceback": startup_error_traceback,
                "env": safe_env
            }
        )