from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
import models

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
