from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
import auth
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

# Gắn các router con (ở đây là các API liên quan đến Authentication như /register, /login)
app.include_router(auth.router)
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