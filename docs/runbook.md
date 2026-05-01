# Runbook: Nền tảng AI Content Generator

Tài liệu này mô tả cách thiết lập môi trường, chạy backend/frontend local, và các lưu ý vận hành phổ biến.

## 1. Yêu cầu hệ thống (Prerequisites)

- **Node.js**: 18.x trở lên (Next.js).
- **Python**: 3.10 trở lên (FastAPI).
- **PostgreSQL**: instance có thể truy cập qua chuỗi kết nối (local, Docker, hoặc Supabase).

---

## 2. Cơ sở dữ liệu

1. Tạo database PostgreSQL trống (hoặc dùng project có sẵn trên Supabase).
2. Áp DDL tham chiếu: `database_schema.sql` ở thư mục gốc repo (schema đầy đủ + ghi chú migration).
3. **Lưu ý ORM:** Trong `backend/models.py`, thuộc tính Python `Project.user_id` map sang cột DB `owner_id` (tương thích schema mới).

Backend dùng `Base.metadata.create_all()` khi khởi động để tạo bảng thiếu; với production nên dùng migration có kiểm soát sau khi đã chốt schema.

---

## 3. Backend (FastAPI)

### 3.1 Cài đặt

Từ thư mục gốc repository:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r ../requirements.txt
```

Dependencies được khai báo trong `requirements.txt` (thư mục gốc), không dùng `lib_lists.md`.

### 3.2 Biến môi trường (`backend/.env`)

Tạo file `backend/.env` (không commit; đã nằm trong `.gitignore`). Các biến thường dùng:

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL (SQLAlchemy), ví dụ `postgresql+psycopg2://user:pass@host:5432/dbname` |
| `JWT_SECRET_KEY` | Chuỗi bí mật ký JWT |
| `hf_key_read` | Token Hugging Face Inference API (sinh nội dung AI) |
| `FRONTEND_BASE_URL` | URL frontend dùng trong link reset mật khẩu, ví dụ `http://127.0.0.1:3000` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Gửi email quên mật khẩu (Gmail dùng App Password) |
| `SMTP_SENDER_NAME` | Tên hiển thị người gửi (tùy chọn) |

### 3.3 Chạy server

Mặc định ví dụ dùng cổng **8000**. Nếu cổng bị chiếm (Windows: `WinError 10013`), đổi sang **8010** và nhớ cập nhật `NEXT_PUBLIC_API_URL` bên frontend cho khớp.

```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Hoặc cổng 8010:

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload
```

Kiểm tra:

- API root: `http://127.0.0.1:8000/` (hoặc `:8010/`)
- DB: `http://127.0.0.1:8000/test-db`

### 3.4 Rate limiting (chống spam)

Middleware in-memory trên các request **`/api/*`** có method **không** thuộc `GET`, `OPTIONS`, `HEAD`:

- Tối đa **10** request trong **5** giây mỗi IP.
- Vượt ngưỡng: HTTP **429**, chặn **5 phút**.

Nếu gặp 429 khi test API bằng script, giảm tần suất POST hoặc đợi `Retry-After`.

### 3.5 Nhóm API chính (tham chiếu nhanh)

- **Auth** (`/api/auth/…`): đăng ký, đăng nhập, `me`, đổi mật khẩu, quên/đặt lại mật khẩu, kiểm tra email (Bloom filter).
- **Projects** (`/api/projects/…`): CRUD project, sinh nội dung, `POST /{id}/continue`, `GET /{id}/contexts`.
- **Teams** (`/api/teams/…`): danh sách/tạo team, token gắn project–team.
- **Audio** (`/api/audio/…`): pipeline job-based async (`POST /jobs` → polling `GET /jobs/{id}` → stream `GET /file/{id}`), có giữ endpoint legacy `/generate` để tương thích frontend cũ.

Swagger: `http://127.0.0.1:8000/docs` (đổi port nếu cần).

### 3.6 Quy trình sinh audio từ prompt (async)

Luồng xử lý hiện tại:

1. Client gọi `POST /api/audio/jobs` với `prompt`.
2. Server tạo `AudioJob(status=queued)` và trả `job_id` ngay (không block request).
3. Background worker xử lý:
   - planner (`services/content/planner.py`)
   - executor (`services/content/executor.py`)
   - gọi FPT TTS async + polling backoff (`services/tts.py`)
   - lưu file + cập nhật `AudioJob`.
4. Client polling `GET /api/audio/jobs/{job_id}` đến khi `status=done`.
5. Client phát/tải file qua `GET /api/audio/file/{job_id}`.

Chi tiết kiến trúc và cách mở rộng model mới xem thêm ở `docs/project-architecture-guide.md`.

---

## 4. Frontend (Next.js)

### 4.1 Cài đặt và chạy dev

```bash
cd frontend
npm install
npm run dev
```

Mặc định: `http://localhost:3000` (hoặc URL mà Next in ra trong terminal).

### 4.2 Biến môi trường

Tạo `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

**Bắt buộc** trùng host/port với backend đang chạy (ví dụ backend 8010 thì đổi thành `http://127.0.0.1:8010`). Dùng `127.0.0.1` thay vì `localhost` nếu gặp lỗi kết nối do phân giải IPv6.

### 4.3 Route UI

- `/` — workspace (dự án, chat composer, dark mode, team workspace, settings).
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/logout`.

Theme sáng/tối lưu trong `localStorage` key `theme` (`light` / `dark`).

### 4.4 Build production (kiểm tra local)

```bash
cd frontend
npm run build
```

---

## 5. Xử lý sự cố thường gặp

| Hiện tượng | Hướng xử lý |
|------------|-------------|
| `NetworkError` / fetch thất bại sau login | Kiểm tra backend đang chạy, `NEXT_PUBLIC_API_URL` đúng port, firewall. |
| HTTP 429 trên POST | Giảm spam click; đợi hết thời gian chặn theo `Retry-After`. |
| Lỗi DB / cột không tồn tại | Đồng bộ schema với `database_schema.sql` và cột `projects.owner_id`. |
| Team API 404 | Đảm bảo đã pull code mới, router `teams` được include trong `main.py`, restart uvicorn. |

---

## 6. Push code / CI

- Không commit `backend/.env`, `frontend/.env.local`.
- Python: `python -m compileall backend` (smoke check).
- Frontend: `npm run build` trước khi merge.

---

*Tài liệu cập nhật theo trạng thái repo: FastAPI + Next.js, PostgreSQL, Hugging Face Inference, SMTP reset password, teams & project context APIs.*
