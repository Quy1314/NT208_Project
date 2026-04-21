from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
import auth
from routers import projects, teams
from sqlalchemy import text

# Tạo sẵn toàn bộ bảng trong database (dựa trên các classes ở models.py) nếu chưa tồn tại
Base.metadata.create_all(bind=engine)

# Khởi tạo application FastAPI chính
app = FastAPI()

# Cấu hình CORS Middleware: Cho phép Frontend (chạy ở localhost:3000) gọi API qua Backend (8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], # Các domain được phép gọi API
    allow_credentials=True,
    allow_methods=["*"], # Cho phép tất cả các method (GET, POST, PUT, DELETE,...)
    allow_headers=["*"], # Cho phép tất cả các header parameter
)

# Rate limit in-memory:
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

    # Hết block thì dọn key cũ.
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

# Gắn các router con
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(teams.router)

@app.get("/")
def read_root():
    # API cơ bản để kiểm tra server có đang chạy ko
    return {"message": "Welcome to the AI Content Generator API"}

@app.get("/test-db")
def test_db():
    """
    API dùng để test kết nối tới database Supabase PostgreSQL. 
    Nó sẽ thử chạy câu lệnh SELECT 1 cơ bản nhất.
    """
    try:
        # Sử dụng context manager (with) để đảm bảo connection luôn được đóng sau khi query xong
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            # scalar() lấy giá trị đầu tiên của dòng đầu tiên trả về
            return {"message": "Database connection successful", "result": result.scalar()} 
    except Exception as e:
        return {"message": "Database connection failed", "error": str(e)}