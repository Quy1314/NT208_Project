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

### 2.1 Canonical lore + retrieval (Modern Text → Image Continuity)

Bổ sung bảng canon, `lore_chunk` (embedding dạng `double precision[]` — **không bắt buộc** pgvector extension), `visual_bible`, v.v.

1. **Migration SQL tham chiếu (production / Supabase SQL editor):** chạy file  
   `backend/migrations/002_canon_multimodal_engine.sql`  
   trên cùng database với `projects` (sau `database_schema.sql` nếu dùng file đó).
2. **Dev:** `import lore.db_models` trong `main.py` đã đăng ký ORM; `create_all()` sẽ tạo các bảng canon nếu chưa có (PostgreSQL bình thường, không cần extension `vector`).
3. **Tài liệu luồng:** `docs/workflows/text-image-continuity.md` (story pack, image pipeline, bootstrap API).

**Bootstrap tối thiểu trước khi ảnh dùng team/outfit từ DB:** tạo `canon_scope` (tự động qua API), `characters`, `visual-variant`, `creatures`, `party/rebuild`, `locations`, optional `visual-bible`, rồi `reindex` để embedding lore.

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
| `CANON_ENGINE_ENABLED` | `true` / `false` — bật context pack + image pipeline canon (mặc định `true`) |
| `CANON_EMBEDDING_MODEL` | Model HF feature-extraction (mặc định `sentence-transformers/all-MiniLM-L6-v2`) |
| `CANON_CHUNK_CHARS` | Độ dài chunk khi index lore (mặc định `900`) |
| `CANON_PROSE_TAIL_CHARS` | Số ký tự cuối `projects.content` ghép thêm vào context pack chỉ để giữ tone (mặc định `0` = tắt) |
| `CANON_INTENT_MODEL` | Model HF chat nhỏ để gợi ý slug từ intent ảnh (mặc định `Qwen/Qwen2.5-7B-Instruct`) |
| `FRONTEND_BASE_URL` | URL frontend dùng trong link reset mật khẩu, ví dụ `http://127.0.0.1:3000` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Gửi email quên mật khẩu (Gmail dùng App Password) |
| `SMTP_SENDER_NAME` | Tên hiển thị người gửi (tùy chọn) |

### 3.3 Chạy server

Trên Windows cổng **8000** đôi khi bị chiếm (`WinError 10013`); repo dùng ví dụ cổng **8001** cho backend và frontend cho khớp. Đổi port khác thì cập nhật `NEXT_PUBLIC_API_URL` bên frontend tương ứng.

```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

Hoặc cổng khác (ví dụ 8010):

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload
```

Kiểm tra:

- API root: `http://127.0.0.1:8001/` (hoặc port bạn chọn)
- DB: `http://127.0.0.1:8001/test-db`

### 3.4 Rate limiting (chống spam)

Middleware in-memory trên các request **`/api/*`** có method **không** thuộc `GET`, `OPTIONS`, `HEAD`:

- Tối đa **10** request trong **5** giây mỗi IP.
- Vượt ngưỡng: HTTP **429**, chặn **5 phút**.

Nếu gặp 429 khi test API bằng script, giảm tần suất POST hoặc đợi `Retry-After`.

### 3.5 Nhóm API chính (tham chiếu nhanh)

- **Auth** (`/api/auth/…`): đăng ký, đăng nhập, `me`, đổi mật khẩu, quên/đặt lại mật khẩu, kiểm tra email (Bloom filter).
- **Projects** (`/api/projects/…`): CRUD project, sinh nội dung, `POST /{id}/continue`, `GET /{id}/contexts` — khi `CANON_ENGINE_ENABLED=true`, story dùng **context pack** (lore DB + semantic chunks); image dùng **scene graph → diffusion recipe** nếu project đã có ít nhất một nhân vật canon.
- **Canon lore** (`/api/projects/{id}/canon/…`): `POST /scope`, `POST /characters`, `POST /visual-variant`, `POST /creatures`, `POST /party/rebuild`, `POST /locations`, `PUT /visual-bible`, `POST /reindex`, `GET /overview`.
- **Teams** (`/api/teams/…`): danh sách/tạo team, token gắn project–team.
- **Audio** (`/api/audio/…`): pipeline job-based async (`POST /jobs` → polling `GET /jobs/{id}` → stream `GET /file/{id}`), có giữ endpoint legacy `/generate` để tương thích frontend cũ.

Swagger: `http://127.0.0.1:8001/docs` (đổi port nếu cần).

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

### 3.7 Canon / continuity — xử lý sự cố

| Hiện tượng | Hướng xử lý |
|------------|------------|
| Ảnh trả về `Continuity validation failed` | Kiểm tra `GET …/canon/overview`; chỉnh `party/rebuild` cho khớp `creature_instance_id` với scene graph. |
| Semantic retrieval lỗi / chunk trống | Gọi `POST …/canon/reindex` với `X-HF-Api-Key`; kiểm tra `CANON_EMBEDDING_MODEL`. |
| Muốn drift thấp hơn nữa | Mở rộng `negative_bank` + `style_pack_json` trong visual bible; lên kế hoạch worker GPU (IP-Adapter) — `docs/workflows/text-image-continuity.md`. |

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
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001
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

*Tài liệu cập nhật theo trạng thái repo: FastAPI + Next.js, PostgreSQL, Hugging Face Inference, canon lore + retrieval + scene graph image pipeline, SMTP reset password, teams & project context APIs.*
