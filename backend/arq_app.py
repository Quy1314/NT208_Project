import os
from arq.connections import RedisSettings, create_pool
from dotenv import load_dotenv

# Nạp các biến môi trường
load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0").strip()

async def get_redis_pool():
    """
    Tạo Redis connection pool phục vụ hàng đợi tác vụ ARQ.
    """
    print(f"[QUEUE] Connecting to Redis at {REDIS_URL}...")
    try:
        return await create_pool(RedisSettings.from_dsn(REDIS_URL))
    except Exception as e:
        print(f"[QUEUE] Failed to connect to Redis: {e}")
        raise
