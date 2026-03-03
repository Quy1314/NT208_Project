# Runbook: Nền tảng AI Content Generator

Tài liệu này hướng dẫn cách thiết lập và khởi chạy dự án trên môi trường Local.

## 1. Yêu cầu hệ thống (Prerequisites)
- **Node.js**: Phiên bản 18.x trở lên (Dùng cho Frontend Next.js).
- **Python**: Phiên bản 3.10 trở lên (Dùng cho Backend FastAPI).
- **PostgreSQL**: Đã có database host (có thể dùng Supabase).

---

## 2. Khởi chạy Backend (FastAPI)

Backend chạy trên port `8000` mặc định.

**Bước 1: Di chuyển vào thư mục backend**
```bash
cd backend
```

**Bước 2: Cài đặt thư viện (nếu có môi trường ảo thì active trước)**
```bash
pip install -r ../lib_lists.md
```
*(Hiện tại script cài đặt lưu ở `lib_lists.md`, hãy đảm bảo các thư viện như `fastapi`, `uvicorn`, `sqlalchemy`,... đã được cài)*

**Bước 3: Thiết lập File Biến Môi Trường**
Copy nội dung mẫu từ `.env` (nếu chưa có) và chú ý điền đúng thông tin:
- `DATABASE_URL`: Đường dẫn chuỗi kết nối Session Pooler (Nếu dùng Supabase IPv4).
- `JWT_SECRET_KEY`: Chuỗi bí mật mã hóa JWT.

**Bước 4: Chạy Máy chủ Uvicorn Server**
```bash
python -m uvicorn main:app --reload
```
Kiểm tra kết nối bằng cách truy cập: `http://127.0.0.1:8000/test-db`

---

## 3. Khởi chạy Frontend (Next.js)

Frontend chạy trên port `3000` mặc định.

**Bước 1: Di chuyển vào thư mục frontend**
```bash
cd frontend
```

**Bước 2: Cài đặt phụ thuộc npm/yarn/pnpm**
```bash
npm install
```

**Bước 3: Cấu hình biến môi trường**
Tạo file `.env.local` ở thư mục `frontend` với nội dung trỏ về Backend API:
```env
NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
```

**Bước 4: Chạy Server Development**
```bash
npm run dev
```
Truy cập trang web tại:
- Đăng nhập (sẽ có sau): `http://localhost:3000/login`
- Đăng ký: `http://localhost:3000/register`
