import os 
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

dotenv_path = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL is None:
    raise RuntimeError("DATABASE_URL is not configured. Set it in backend/.env or the environment.")

# Tối ưu hóa Database Connection Pooling cho Production và Serverless
# Lưu ý: Khi deploy dự án lên Serverless (như Vercel) hoặc các container tự động scale (Render):
# - Ưu tiên cấu hình DATABASE_URL trỏ tới Supabase Connection Pooler (Transaction mode, cổng 6543) để tránh cạn kiệt kết nối DB.
# - Khi dùng Transaction Pooler, hãy tắt Prepared Statements (nếu dùng pg_pooler/prisma/alembic trực tiếp) bằng cách cấu hình thích hợp.
connect_args = {}
if "postgresql" in DATABASE_URL:
    connect_args["sslmode"] = "require"

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,       # Gửi lệnh test SELECT 1 trước khi dùng kết nối từ pool để tránh kết nối chết
    pool_size=15,             # Giới hạn số kết nối cố định được giữ trong pool
    max_overflow=25,          # Số lượng kết nối tối đa được tạo thêm tạm thời khi tải tăng đột biến
    pool_recycle=1800,        # Giải phóng các kết nối sau 30 phút để tránh bị firewall/Supabase ngắt kết nối
) # kết nối đến database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) # tạo session
Base = declarative_base()  # base class cho các model

def get_db():
    db = SessionLocal() # tạo session
    try:
        yield db # trả về session
    finally:
        db.close() # đóng session