from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
import models
import os
from datetime import datetime, timedelta
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Tạo Router cho Auth
router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Cấu hình Passlib để sử dụng thuật toán bcrypt mã hóa mật khẩu
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Schema (Khuôn mẫu) để nhận dữ liệu JSON từ Frontend gửi lên
class UserRegister(BaseModel):
    email: str
    password: str

# Hàm phụ trợ hash mật khẩu
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

@router.post("/register")
def register_user(user: UserRegister, db: Session = Depends(get_db)):
    # 1. Kiểm tra xem email này đã đăng ký chưa
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email này đã được đăng ký."
        )
    
    # 2. Băm(Hash) mật khẩu thay vì lưu plain text
    hashed_password = get_password_hash(user.password)
    
    # 3. Khởi tạo đối tượng User và lưu vào Database (PostgreSQL)
    new_user = models.User(email=user.email, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user) # load lại để lấy ID do auto-generate sinh ra
    
    # 4. Trả kết quả JSON về 
    return {
        "message": "Đăng ký tài khoản thành công!",
        "user": {
            "id": str(new_user.id),
            "email": new_user.email
        }
    }

class UserLogin(BaseModel):
    email: str
    password: str

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không đúng."
        )
    
    if not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không đúng."
        )

    # Generate JWT Token
    access_token = create_access_token(data={"sub": str(db_user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email
        }
    }
