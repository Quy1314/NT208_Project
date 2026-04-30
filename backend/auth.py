from fastapi import APIRouter, Depends, HTTPException, status, Form, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
import models
import os
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr
import smtplib
import secrets
import hashlib
import threading
from zoneinfo import ZoneInfo
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


class EmailBloomFilter:
    def __init__(self, bit_size: int = 200_003, hash_count: int = 7):
        self.bit_size = bit_size
        self.hash_count = hash_count
        self.bits = bytearray((bit_size + 7) // 8)

    def _hash_indices(self, value: str):
        normalized = value.strip().lower().encode("utf-8")
        digest1 = int(hashlib.sha256(normalized).hexdigest(), 16)
        digest2 = int(hashlib.md5(normalized).hexdigest(), 16)
        for i in range(self.hash_count):
            yield (digest1 + i * digest2 + i * i) % self.bit_size

    def add(self, value: str):
        for idx in self._hash_indices(value):
            self.bits[idx // 8] |= (1 << (idx % 8))

    def might_contain(self, value: str) -> bool:
        for idx in self._hash_indices(value):
            if not (self.bits[idx // 8] & (1 << (idx % 8))):
                return False
        return True


email_bloom = EmailBloomFilter()
bloom_initialized = False
bloom_lock = threading.Lock()


def ensure_bloom_loaded(db: Session):
    global bloom_initialized
    if bloom_initialized:
        return
    with bloom_lock:
        if bloom_initialized:
            return
        users = db.query(models.User.email).all()
        for (email,) in users:
            if email:
                email_bloom.add(email)
        bloom_initialized = True

# Schema đã được chuyển sang file models.py

# Hàm phụ trợ dùng để băm (hash) mật khẩu gốc thành chuỗi bảo mật an toàn
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password[:72])

@router.post("/register")
def register_user(user: models.UserRegister, db: Session = Depends(get_db)):
    """
    API đăng ký người dùng mới.
    Quy trình: Kiểm tra email -> Băm mật khẩu -> Lưu xuống CSDL.
    """
    ensure_bloom_loaded(db)
    normalized_email = user.email.strip().lower()

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
    new_user = models.User(email=normalized_email, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user) # load lại để lấy ID do auto-generate sinh ra
    email_bloom.add(normalized_email)
    
    # 4. Trả kết quả JSON về báo hiệu đăng ký thành công
    return {
        "message": "Đăng ký tài khoản thành công!",
        "user": {
            "id": str(new_user.id),
            "email": new_user.email
        }
    }


@router.get("/check-user")
def check_user_exists(email: str = Query(..., min_length=3), db: Session = Depends(get_db)):
    """
    Kiểm tra user tồn tại nhanh bằng Bloom filter.
    - Nếu Bloom trả về false -> chắc chắn chưa tồn tại.
    - Nếu Bloom trả về true -> kiểm tra lại DB để xác nhận.
    """
    ensure_bloom_loaded(db)
    normalized_email = email.strip().lower()

    if not email_bloom.might_contain(normalized_email):
        return {"exists": False}

    exists = db.query(models.User).filter(models.User.email == normalized_email).first() is not None
    return {"exists": exists}

# Schema Data dùng riêng cho việc Login (tránh nhầm lẫn với Register) đã được chuyển sang models.py

# Hàm kiểm chứng xem password nhập vào có khớp với mã băm lấy trong DB không
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password[:72], hashed_password)

# Hàm sinh JWT Token có gắn kèm thông tin cơ bản và thời gian hết hạn
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    # Ký kết chuỗi Token bằng thuật toán HS256 và Secret Key lưu trong biến môi trường
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def send_reset_email(email: str, reset_token: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    sender_name = os.getenv("SMTP_SENDER_NAME", "Super AI Agent")
    frontend_url = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:3000")

    if not smtp_user or not smtp_password:
        print("SMTP_USER/SMTP_PASSWORD chưa được cấu hình, bỏ qua gửi mail reset.")
        return

    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    msg = EmailMessage()
    msg["Subject"] = "Reset your AI Generator password"
    msg["From"] = formataddr((sender_name, smtp_user))
    msg["To"] = email
    msg.set_content(
        f"Bạn vừa yêu cầu đặt lại mật khẩu.\n"
        f"Bấm vào link sau để đổi mật khẩu: {reset_url}\n"
        f"Link có hiệu lực trong 30 phút."
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

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


@router.post("/forgot-password")
def forgot_password(data: models.ForgotPasswordRequest, db: Session = Depends(get_db)):
    ensure_bloom_loaded(db)
    normalized_email = data.email.strip().lower()

    # Bloom filter trả false => chắc chắn chưa tồn tại.
    if not email_bloom.might_contain(normalized_email):
        return {"message": "Tài khoản không tồn tại."}

    # Bloom trả true => cần xác nhận lại DB (tránh false positive).
    db_user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if not db_user:
        return {"message": "Tài khoản không tồn tại."}

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(ZoneInfo("UTC")) + timedelta(minutes=30)

    reset_token = models.PasswordResetToken(
        user_id=db_user.id,
        token=token,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    try:
        send_reset_email(db_user.email, token)
    except Exception as e:
        print(f"Lỗi gửi reset mail: {e}")

    return {"message": "Đã gửi email đặt lại mật khẩu."}


@router.post("/reset-password")
def reset_password(data: models.ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == data.token)
        .first()
    )

    if not reset_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token không hợp lệ.")
    if reset_token.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token đã được sử dụng.")
    if reset_token.expires_at < datetime.now(ZoneInfo("UTC")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token đã hết hạn.")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu mới tối thiểu 8 ký tự.")

    db_user = db.query(models.User).filter(models.User.id == reset_token.user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

    db_user.password_hash = get_password_hash(data.new_password)
    reset_token.used_at = datetime.now(ZoneInfo("UTC"))
    db.commit()

    return {"message": "Đổi mật khẩu thành công. Vui lòng đăng nhập lại."}


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

@router.post("/change-password")
def change_password(
    data: models.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng.")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu mới tối thiểu 8 ký tự.")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu mới phải khác mật khẩu hiện tại.")

    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Đổi mật khẩu thành công."}

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
