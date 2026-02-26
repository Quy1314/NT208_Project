from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
import auth
from sqlalchemy import text
from fastapi import FastAPI
Base.metadata.create_all(bind=engine)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
@app.get("/")
def read_root():
    return {"message": "Welcome to the AI Content Generator API"}
@app.get("/test-db")
def test_db():
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            return {"message": "Database connection successful", "result": result.scalar()} 
    except Exception as e:
        return {"message": "Database connection failed", "error": str(e)}