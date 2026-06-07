import os
import sys
from pathlib import Path
from arq.connections import RedisSettings
from dotenv import load_dotenv

# Thêm thư mục backend vào sys.path để chạy arq độc lập
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Nạp các biến môi trường
load_dotenv(dotenv_path=backend_dir / ".env")

# Import task xử lý
from services.worker import process_audio_job_async

redis_env = os.getenv("REDIS_URL") or os.getenv("KV_URL") or "redis://127.0.0.1:6379/0"
REDIS_URL = redis_env.strip()

class WorkerSettings:
    """
    Cấu hình chạy ARQ worker.
    Khởi chạy bằng lệnh: arq arq_worker.WorkerSettings
    """
    functions = [process_audio_job_async]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    
    # Giới hạn timeout cho các job nặng
    job_timeout = 300  # 5 phút
    max_jobs = 10      # Số tác vụ chạy đồng thời tối đa trên 1 worker
