from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
import models
import os
from datetime import datetime, timedelta
from jose import jwt, JWTError
from dotenv import load_dotenv

# Tải các biến môi trường từ file .env
load_dotenv()

# Lấy các cấu hình bảo mật từ biến môi trường (hoặc dùng mặc định rỗng nếu không có)
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Tạo Router cho Auth (Nhóm các API chung prefix để gọi trong file main.py)
router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Cấu hình Passlib để sử dụng thuật toán bcrypt mã hóa mật khẩu, tránh bị lộ khi bị hack database
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Schema (Khuôn mẫu) báo hiệu cho FastAPI biết format dữ liệu JSON mà Frontend sẽ gửi lên
class UserRegister(BaseModel):
    email: str
    password: str

# Hàm phụ trợ dùng để băm (hash) mật khẩu gốc thành chuỗi bảo mật an toàn
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

@router.post("/register")
def register_user(user: UserRegister, db: Session = Depends(get_db)):
    """
    API đăng ký người dùng mới.
    Quy trình: Kiểm tra email -> Băm mật khẩu -> Lưu xuống CSDL.
    """
    # 1. Tra cứu xem email này đã tồn tại trong CSDL chưa
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email này đã được đăng ký."
        )
    
    # 2. Băm(Hash) mật khẩu thay vì lưu plain text (Rất quan trọng về an toàn)
    hashed_password = get_password_hash(user.password)
    
    # 3. Khởi tạo đối tượng User và lưu vào Database (PostgreSQL)
    new_user = models.User(email=user.email, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user) # load lại để lấy ID do auto-generate sinh ra
    
    # 4. Trả kết quả JSON về báo hiệu đăng ký thành công
    return {
        "message": "Đăng ký tài khoản thành công!",
        "user": {
            "id": str(new_user.id),
            "email": new_user.email
        }
    }

# Schema Data dùng riêng cho việc Login (tránh nhầm lẫn với Register)
class UserLogin(BaseModel):
    email: str
    password: str

# Hàm kiểm chứng xem password nhập vào có khớp với mã băm lấy trong DB không
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# Hàm sinh JWT Token có gắn kèm thông tin cơ bản và thời gian hết hạn
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    # Ký kết chuỗi Token bằng thuật toán HS256 và Secret Key lưu trong biến môi trường
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/login")
def login_user(form_data: OAuth2PasswordRequestForm = Depends(), is_remember: bool = Form(False), db: Session = Depends(get_db)):
    """
    API xử lý Đăng nhập chuẩn OAuth2 (dùng cho cả Frontend lẫn Swagger UI Authorize).
    Nhận Form Data (username, password), trả về JWT Token (Access Token).
    """
    # Trong OAuth2PasswordRequestForm, trường email sẽ được map vào biến `username`
    db_user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không đúng."
        )
    
    if not verify_password(form_data.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không đúng."
        )

    # Lưu trạng thái "Remember Me" vào CSDL cho User này
    db_user.is_remember = is_remember
    db.commit()

    # Sinh (Generate) JWT Token với mã định danh (subject 'sub') là ID của người dùng
    access_token = create_access_token(data={"sub": str(db_user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email
        }
    }

# ==========================================
# BẢO VỆ API (PROTECTED ROUTES)
# ==========================================

# Khai báo chuẩn OAuth2, token URL trỏ về API /login mà ta vừa viết ở trên
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Hàm Dependency: Dùng để chèn vào các API bắt buộc phải Đăng Nhập.
    Nó sẽ tự động lấy Token từ Header 'Authorization: Bearer <token>', 
    giải mã (decode) Token đó ra để lấy ID user.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực thông tin (Token quá hạn hoặc sai).",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Giải mã Token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Truy vấn DB xem user này còn tồn tại không
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception
        
    return user

@router.get("/me")
def read_users_me(current_user: models.User = Depends(get_current_user)):
    """
    API Test: Trả về thông tin của User hiện tại dựa vào Token gửi lên.
    Ví dụ này cho thấy cách dòng Depends(get_current_user) bảo vệ API thế nào.
    """
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "created_at": current_user.created_at
    }
