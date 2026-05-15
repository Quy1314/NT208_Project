import os
from dotenv import load_dotenv
load_dotenv()
from database import engine, SessionLocal
import models
import uuid

def test():
    db = SessionLocal()
    # Lấy một user mẫu.
    user = db.query(models.User).first()
    if not user:
        print("No user found")
        return
    
    # Thử query bằng id dạng chuỗi.
    user_id_str = str(user.id)
    print(f"User ID string: {user_id_str}")
    
    match = db.query(models.User).filter(models.User.id == user_id_str).first()
    if match:
        print("String query works!")
    else:
        print("String query fails! Need cast.")
        
test()
