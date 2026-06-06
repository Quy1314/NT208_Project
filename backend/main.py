from dotenv import load_dotenv
load_dotenv()

import os
import sys
import traceback

try:
    # --- START OF ACTUAL CODE ---
    # Kiểm tra an toàn bảo mật môi trường Production
    if os.getenv("ENV") == "production":
        jwt_secret = os.getenv("JWT_SECRET_KEY")
        if not jwt_secret or jwt_secret.strip() == "" or jwt_secret.strip().lower() == "secret":
            print("WARNING: JWT_SECRET_KEY is not set or insecure in production! Using fallback key for testing.")
            os.environ["JWT_SECRET_KEY"] = "fallback-temporary-secret-key-for-vercel-testing-only"

    from collections import defaultdict, deque
    from datetime import datetime, timedelta, timezone
    from pathlib import Path

    BACKEND_DIR = Path(__file__).resolve().parent
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from sqlalchemy import text

    from database import engine, Base
    import models
    import lore.db_models  # noqa: F401 — registers canonical lore ORM tables on Base.metadata
    import auth
    from routers import projects, teams, audio, canon, video, prompt_templates

    # Không tự tạo bảng khi import app trên production/serverless.
    # Chạy schema/migration riêng thay vì gọi create_all ở cold start Vercel.
    if os.getenv("AUTO_CREATE_TABLES", "false").lower() == "true":
        Base.metadata.create_all(bind=engine)

    # Vercel Serverless chỉ cho ghi file tạm trong /tmp; bundle /var/task là read-only.
    def _runtime_dir(name: str) -> Path:
        if os.getenv("VERCEL"):
            return Path("/tmp") / name
        return Path(name)

    OUTPUTS_DIR = _runtime_dir("outputs")
    UPLOADS_DIR = _runtime_dir("uploads")

    # Tạo folder outputs và uploads
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / "audio").mkdir(parents=True, exist_ok=True)

    # Khởi tạo application FastAPI chính
    app = FastAPI()

    # Mount folder outputs và uploads để frontend có thể truy cập file tĩnh nếu cần
    app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

    # Cấu hình CORS Middleware: Cho phép Frontend gọi API qua Backend
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

    # Rate limit lưu trong memory:
    # - Tối đa 10 request / 5 giây cho mỗi client.
    # - Nếu vượt ngưỡng: chặn 5 phút.
    WINDOW_SECONDS = 5
    MAX_REQUESTS_IN_WINDOW = 10
    BLOCK_SECONDS = 300
    request_windows = defaultdict(deque)
    blocked_until = {}

    @app.middleware("http")
    async def anti_spam_middleware(request: Request, call_next):
        # Chỉ áp dụng rate limit cho API ghi dữ liệu để tránh block khi F5/UI polling.
        # Các request GET/OPTIONS/HEAD không bị tính limit.
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

    # Đăng ký routers
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
        """
        API dùng để test kết nối tới database Supabase PostgreSQL.
        Nó sẽ thử chạy câu lệnh SELECT 1 cơ bản nhất.
        """
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                return {
                    "message": "Database connection successful",
                    "result": result.scalar(),
                }
        except Exception as e:
            return {"message": "Database connection failed", "error": str(e)}

except BaseException as startup_err:
    from fastapi import FastAPI
    app = FastAPI()

    @app.get("/{path:path}")
    def fallback(path: str):
        pg_env = {k: v for k, v in os.environ.items() if k.startswith("PG")}
        return {
            "error": "Startup failed",
            "detail": str(startup_err),
            "traceback": traceback.format_exc(),
            "pg_env_keys": list(pg_env.keys()),
            "pg_env": {k: (f"{v[:2]}...{v[-2:]} (len={len(v)})" if len(v) > 4 else "***") for k, v in pg_env.items()}
        }