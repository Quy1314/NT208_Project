import os 
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

dotenv_path = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL) # kết nối đến database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) # tạo session
Base = declarative_base()  # base class cho các model

def get_db():
    db = SessionLocal() # tạo session
    try:
        yield db # trả về session
    finally:
        db.close() # đóng session