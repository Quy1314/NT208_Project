# Runbook: Nền tảng AI Content Generator

Tài liệu này mô tả cách thiết lập môi trường, chạy backend/frontend local, và các lưu ý vận hành phổ biến.

## 1. Yêu cầu hệ thống (Prerequisites)

- **Node.js**: 18.x trở lên (Next.js).
- **Python**: 3.10 trở lên (FastAPI).
- **PostgreSQL**: instance có thể truy cập qua chuỗi kết nối (local, Docker, hoặc Supabase).
- **FFmpeg**: cần cho `pydub` (audio pipeline) — xem chi tiết cài đặt ở mục 3.1.

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

### 2.2 Các bảng ORM chính (tham chiếu nhanh)

| Bảng DB | Model Python | Ghi chú |
|---------|-------------|---------|
| `users` | `User` | `id`, `email`, `password_hash`, `is_remember` |
| `projects` | `Project` | `user_id` → cột `owner_id`; relationship `context_entries` |
| `project_context_entries` | `ProjectContextEntry` | Lưu lịch sử prompt + generated content |
| `password_reset_tokens` | `PasswordResetToken` | Token quên mật khẩu (SMTP) |
| `team_workspaces` | `TeamWorkspace` | Không gian làm việc nhóm |
| `team_workspace_members` | `TeamMember` | Thành viên nhóm (`role`: `member`) |
| `project_team_tokens` | `ProjectTeamToken` | Token gắn project ↔ team |
| `audio_files` | `AudioFile` | File audio đã tạo, gắn với project |
| `audio_jobs` | `AudioJob` | Job async TTS (queued → processing → done/failed) |
| `prompt_templates` | `PromptTemplate` | Template prompt tái sử dụng (cá nhân/team/public) |

---

## 3. Backend (FastAPI)

### 3.1 Cài đặt

Từ **thư mục gốc repository** (`Project_AI_Agent`), cài dependencies Python bằng interpreter đang được IDE/shell chọn:

```powershell
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
```

Nếu máy không có Python Launcher (`py`), dùng `python` tương đương:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Dependencies được khai báo trong `requirements.txt` (thư mục gốc), không dùng `lib_lists.md`.

`pyrefly.toml` chỉ cấu hình `search-path = ["backend"]`; không pin interpreter theo đường dẫn local. Nếu IDE/Pyrefly vẫn báo thiếu module sau khi cài dependencies, chọn đúng Python interpreter trong IDE rồi restart language server hoặc reload VS Code/Antigravity.

> **Yêu cầu hệ thống — FFmpeg:** `pydub` (dùng trong audio pipeline) cần ffmpeg. Nếu chưa cài:
> ```powershell
> winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
> ```
> Sau đó **restart terminal** để PATH cập nhật.

### 3.2 Biến môi trường (`backend/.env`)

Tạo file `backend/.env` (không commit; đã nằm trong `.gitignore`). Các biến thường dùng:

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL (SQLAlchemy), ví dụ `postgresql+psycopg2://user:pass@host:5432/dbname` |
| `JWT_SECRET_KEY` | Chuỗi bí mật ký JWT |
| `hf_key_read` | Token Hugging Face Inference API (sinh nội dung AI — text & image) |
| `CANON_ENGINE_ENABLED` | `true` / `false` — bật context pack + image pipeline canon (mặc định `true`) |
| `CANON_EMBEDDING_MODEL` | Model HF feature-extraction (mặc định `sentence-transformers/all-MiniLM-L6-v2`) |
| `CANON_CHUNK_CHARS` | Độ dài chunk khi index lore (mặc định `900`) |
| `CANON_PROSE_TAIL_CHARS` | Số ký tự cuối `projects.content` ghép thêm vào context pack chỉ để giữ tone (mặc định `0` = tắt) |
| `CANON_INTENT_MODEL` | Model HF chat nhỏ để gợi ý slug từ intent ảnh (mặc định `Qwen/Qwen2.5-7B-Instruct`) |
| `FRONTEND_BASE_URL` | URL frontend dùng trong link reset mật khẩu, ví dụ `http://127.0.0.1:3000` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Gửi email quên mật khẩu (Gmail dùng App Password) |
| `SMTP_SENDER_NAME` | Tên hiển thị người gửi (tùy chọn) |
| `FPT_API_KEY` | API key FPT AI TTS (tạo audio) |
| `KLING_ACCESS_KEY` | Kling AI Access Key (tạo video; lấy từ kling.ai/dev/api-key) |
| `KLING_SECRET_KEY` | Kling AI Secret Key — copy ngay khi tạo, không xem lại được |
| `FAL_KEY` | (Tùy chọn) fal-client API key cho video provider `fal` (fal-ai/minimax-video) |

### 3.3 Chạy server

Trên Windows cổng **8000** đôi khi bị chiếm (`WinError 10013`); repo dùng ví dụ cổng **8001** cho backend và frontend cho khớp. Đổi port khác thì cập nhật `NEXT_PUBLIC_API_URL` bên frontend tương ứng.

Từ thư mục gốc repository:

```powershell
py -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 --reload
```

Hoặc nếu đang đứng trong thư mục `backend`:

```powershell
py -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

Nếu máy không có Python Launcher (`py`), thay `py` bằng `python`.

Hoặc cổng khác (ví dụ 8010):

```powershell
py -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload
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
- **Projects** (`/api/projects/…`): CRUD project, sinh nội dung (text + image), `POST /{id}/continue`, `GET /{id}/contexts`, dịch export (`POST /export-translate`) — khi `CANON_ENGINE_ENABLED=true`, story dùng **context pack** (lore DB + semantic chunks); image dùng **scene graph → diffusion recipe** nếu project đã có ít nhất một nhân vật canon.
- **Canon lore** (`/api/projects/{id}/canon/…`): `POST /scope`, `POST /characters`, `POST /visual-variant`, `POST /creatures`, `POST /party/rebuild`, `POST /locations`, `PUT /visual-bible`, `POST /reindex`, `GET /overview`.
- **Teams** (`/api/teams/…`): danh sách/tạo team, token gắn project–team, `POST /{team_id}/join`, `POST /{team_id}/quit`, `POST /{team_id}/leave` (alias cho quit).
- **Video** (`/api/video/…`): `POST /generate` — hỗ trợ 2 provider: `fal` (fal-ai/minimax-video, mặc định, nhanh) và `kling` (Kling AI text-to-video, chất lượng cao). Provider `kling` cần `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (env hoặc header).
- **Audio** (`/api/audio/…`): pipeline job-based async (`POST /jobs` → polling `GET /jobs/{id}` → stream `GET /file/{id}`), có giữ endpoint legacy `/generate` để tương thích frontend cũ.
- **Prompt Templates** (`/api/prompt-templates/…`): CRUD prompt templates tái sử dụng — `POST /` (tạo), `GET /` (danh sách, hỗ trợ filter theo `team_id` và `include_public`), `GET /{id}` (chi tiết), `PUT /{id}` (cập nhật), `DELETE /{id}` (xóa). Hỗ trợ `content_type`: `novel`, `comic_script`, `video_script`, `lyrics`, `other`. Templates có thể là cá nhân, gắn team, hoặc public.

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

### 3.7 Quy trình sinh video từ prompt

Endpoint `POST /api/video/generate` hỗ trợ 2 provider:

| Provider | Model mặc định | Yêu cầu | Ghi chú |
|----------|----------------|----------|---------|
| `fal` (default) | `fal-ai/minimax/video-01` | `fal-client` (pip) | Nhanh, không cần env key riêng (dùng key fal) |
| `kling` | `kling-v2-6` | `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` | Chất lượng cao, polling async (timeout 300s) |

**Request body mẫu:**
```json
{
  "prompt": "A beautiful sunset over the calm sea",
  "provider": "fal",
  "project_id": "optional-uuid",
  "context": "optional story context",
  "project_title": "optional title"
}
```

Kling-specific options: `kling_model`, `kling_duration` (`"5"` hoặc `"10"`), `kling_mode` (`"std"` hoặc `"pro"`).

### 3.8 Canon / continuity — xử lý sự cố

| Hiện tượng | Hướng xử lý |
|------------|------------|
| Ảnh trả về `Continuity validation failed` | Kiểm tra `GET …/canon/overview`; chỉnh `party/rebuild` cho khớp `creature_instance_id` với scene graph. |
| Semantic retrieval lỗi / chunk trống | Gọi `POST …/canon/reindex` với `X-HF-Api-Key`; kiểm tra `CANON_EMBEDDING_MODEL`. |
| Muốn drift thấp hơn nữa | Mở rộng `negative_bank` + `style_pack_json` trong visual bible; lên kế hoạch worker GPU (IP-Adapter) — `docs/workflows/text-image-continuity.md`. |

### 3.9 Streaming Response (Streaming Reason / Progressive text)

Hệ thống hỗ trợ cơ chế phản hồi dạng stream (Server-Sent Events - SSE) cho các mô hình ngôn ngữ (text generation) để tối ưu trải nghiệm người dùng:
- Các endpoint hỗ trợ: `POST /api/projects/` và `POST /api/projects/{project_id}/continue`.
- Kích hoạt bằng cách truyền thêm tham số query: `?stream=true`.
- Trạng thái trả về: `text/event-stream` bao gồm các loại event:
  - `event: init` mang project ID vừa tạo.
  - `event: chunk` mang các phần văn bản được sinh ra liên tiếp.
  - `event: done` mang nội dung truyện đầy đủ cuối cùng sau khi hoàn tất.
  - `event: error` nếu có lỗi trong quá trình kết nối/gọi API AI.
- Nếu không bật `stream=true` hoặc request đối với các mô hình media (Stable Diffusion, TTS), hệ thống tự động quay về cơ chế phản hồi JSON đồng bộ truyền thống.

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

- `/` — workspace chính (dự án, chat composer, dark mode, team workspace, settings, prompt templates).
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/logout`.
- `/landing` — trang landing page giới thiệu sản phẩm.
- `/story` — xem/đọc story chi tiết.
- `/workspace` — giao diện workspace mở rộng.

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
| Video fal lỗi 502 | Kiểm tra `fal-client` cài đúng (`pip install fal-client>=0.5`), kiểm tra network. |
| Video kling timeout 504 | Task vượt 300s; thử lại hoặc dùng `kling_mode: "std"` thay `"pro"`. |
| Kling 400 "key chưa cấu hình" | Thêm `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` vào `backend/.env` hoặc gửi header. |
| Prompt Template 403 | Kiểm tra user là owner của template hoặc team. |

---

## 6. Push code / CI

- Không commit `backend/.env`, `frontend/.env.local`.
- Python: `python -m compileall backend` (smoke check).
- Frontend: `npm run build` trước khi merge.

---

## 7. Kiểm thử tích hợp E2E (E2E Integration Testing)

Hệ thống cung cấp một script kiểm thử tích hợp E2E tự động chạy qua toàn bộ luồng chức năng chính của backend và tích hợp AI pipeline.

### 7.1 Các bước kiểm thử được thực thi
1. **Đăng ký (Register)**: Đăng ký một tài khoản test mới với email ngẫu nhiên.
2. **Đăng nhập (Login)**: Xác thực tài khoản test và nhận JWT access token.
3. **Đăng xuất (Logout)**: Giả lập xóa token trên client, gửi request không hợp lệ và kiểm tra xem backend có trả về HTTP `401 Unauthorized` hay không.
4. **Đăng nhập lại**: Đăng nhập lại để tái lập phiên hoạt động cho các bước sau.
5. **Tạo Story 1 (Create Project)**: Sinh nội dung truyện chữ bằng model LLM (mặc định: `Qwen/Qwen2.5-72B-Instruct` qua HF).
6. **Tạo Team Workspace**: Tạo không gian làm việc nhóm mới.
7. **Join Team**: Thêm một tài khoản test thứ hai vào nhóm vừa tạo.
8. **Quit Team**: Cho phép tài khoản thứ hai rời nhóm.
9. **Tạo Story 2**: Tạo truyện thứ hai để xác minh tính ổn định khi gọi liên tục.
10. **Tạo Ảnh (Create Image)**: Sinh ảnh từ prompt sử dụng model Diffusion (mặc định: `black-forest-labs/FLUX.1-schnell`).
11. **Tạo Video (Create Video)**: Sinh video ngắn bằng prompt qua provider `fal` (`fal-ai/minimax/video-01`).
12. **Tạo Âm thanh (Create Audio)**: Tạo tác vụ sinh giọng nói (TTS) không đồng bộ qua API FPT AI và polling trạng thái cho đến khi hoàn thành.
13. **Quy trình đa phương tiện liên tiếp (Multi-modal Story Flow)**: Tạo truyện chữ -> sinh ảnh mô tả -> sinh audio đọc truyện trong cùng một dự án.
14. **Streaming Story Creation**: Kiểm tra tính năng stream Server-Sent Events khi tạo mới dự án chữ.
15. **Streaming Story Continuation**: Kiểm tra tính năng stream Server-Sent Events khi yêu cầu viết tiếp.

### 7.2 Cách chạy kiểm thử E2E
Đảm bảo backend uvicorn đang chạy (ví dụ trên cổng `8001`), sau đó đứng ở thư mục gốc của repository chạy lệnh:

```powershell
python backend/test_e2e_flow.py
```

### 7.3 Báo cáo kết quả kiểm thử (HTML Report)
Sau khi script chạy xong, một báo cáo HTML hiển thị kết quả kiểm thử trực quan tuyệt đẹp sẽ được lưu tại thư mục gốc của dự án:
- Đường dẫn file: `Project_AI_Agent/openspec_report.html`
- Báo cáo hiển thị chi tiết trạng thái từng bước kiểm thử (PASSED, WARNING, FAILED), thời gian chạy, log lỗi chi tiết (nếu có) và hiển thị trực tiếp các media assets (ảnh, video, audio) được sinh ra từ AI.

---

## 8. Cấu trúc thư mục chính

```
Project_AI_Agent/
├── backend/
│   ├── main.py              # FastAPI app, middleware, router includes
│   ├── auth.py               # Auth endpoints (register, login, me, password)
│   ├── models.py             # SQLAlchemy ORM + Pydantic schemas
│   ├── database.py           # Engine, SessionLocal, Base
│   ├── routers/
│   │   ├── projects.py       # CRUD projects, AI generation, export-translate
│   │   ├── teams.py          # Team workspace, join, quit, project-token
│   │   ├── audio.py          # Audio jobs async pipeline
│   │   ├── video.py          # Video generation (fal + Kling AI)
│   │   ├── canon.py          # Canon lore endpoints
│   │   └── prompt_templates.py  # CRUD prompt templates
│   ├── services/
│   │   ├── kling.py          # Kling AI text-to-video service
│   │   ├── tts.py            # FPT AI TTS service
│   │   ├── worker.py         # Background audio worker
│   │   ├── audio_pipeline.py # Audio pipeline orchestrator
│   │   └── content/          # Planner + Executor cho AI content
│   ├── lore/                 # Canon lore ORM models
│   ├── image_pipeline/       # Image generation pipeline
│   ├── scene_graph/          # Scene graph for continuity
│   ├── prompt_builder/       # Prompt construction utilities
│   ├── retrieval/            # Semantic retrieval (embedding)
│   ├── story_engine/         # Story continuation engine
│   ├── validators/           # Input validators
│   ├── migrations/           # SQL migration files
│   └── test_e2e_flow.py      # E2E integration test script
├── frontend/                 # Next.js frontend
│   └── src/app/
│       ├── page.tsx           # Main workspace
│       ├── login/             # Login page
│       ├── register/          # Register page
│       ├── forgot-password/   # Forgot password
│       ├── reset-password/    # Reset password
│       ├── logout/            # Logout
│       ├── landing/           # Landing page
│       ├── story/             # Story viewer
│       └── workspace/         # Extended workspace
├── docs/                     # Documentation
├── openspec/                 # OpenSpec config & specs
├── database_schema.sql       # Full DDL reference
├── requirements.txt          # Python dependencies
└── openspec_report.html      # Latest E2E test report (auto-generated)
```

---

*Tài liệu cập nhật theo trạng thái repo: FastAPI + Next.js, PostgreSQL, Hugging Face Inference, E2E Test Suite, canon lore + retrieval + scene graph image pipeline, SMTP reset password, teams & project context APIs, video generation (fal + Kling AI), prompt templates CRUD, async audio jobs pipeline.*
