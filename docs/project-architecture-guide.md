# Backend Architecture Guide

Tài liệu này mô tả cấu trúc backend hiện tại và cách mở rộng thêm model mới (ví dụ image/video) theo cùng pattern với audio.

## 1) Mục tiêu kiến trúc

- Tách rõ `router` (HTTP) và `service` (nghiệp vụ).
- Hỗ trợ pipeline async theo job: `queued -> processing -> done/failed`.
- Dễ thêm modality mới (audio, image, video) mà không sửa lan man nhiều file.

## 2) Cấu trúc thư mục đề xuất

```text
backend/
  routers/
    audio.py              # API endpoints cho audio jobs và legacy API
    projects.py
    teams.py

  services/
    content/
      planner.py          # Chuẩn hóa plan từ prompt
      executor.py         # Execute plan -> output text
      handlers.py         # Các handler theo subtype (speech/sfx/song)
      registry.py         # Registry map subtype -> handler
      types.py            # TypedDict cho ExecutionPlan
    audio_pipeline.py     # Reusable helper cho sync audio generation
    tts.py                # FPT TTS async + polling/backoff + long text chunking
    worker.py             # Background job processor

  models.py               # SQLAlchemy models + Pydantic schemas
  main.py                 # App bootstrap, routers, middleware
```

## 3) Luồng audio hiện tại

1. `POST /api/audio/jobs` tạo `AudioJob(status=queued)`.
2. `BackgroundTasks` gọi `process_audio_job(job_id)`.
3. Worker:
   - `plan_audio_prompt(...)`
   - `execute_prompt_to_text(...)`
   - `generate_tts_audio(...)`
   - lưu file và cập nhật `AudioJob`.
4. Client polling `GET /api/audio/jobs/{job_id}`.
5. Khi done, client lấy file qua `GET /api/audio/file/{job_id}`.

## 4) Guide thêm model mới (image/video)

Checklist chuẩn:

1. **Thêm DB model job riêng (khuyến nghị)**
   - Ví dụ: `ImageJob`, `VideoJob` trong `models.py`.
   - Fields tối thiểu: `id`, `user_id`, `prompt`, `status`, `result_path/url`, `error`, `created_at`.

2. **Thêm schema request/response**
   - `ImageJobCreateReq`, `ImageJobStatusResp`...
   - Trả JSON nhất quán với audio.

3. **Thêm planner/executor handler**
   - Nếu cùng cơ chế prompt planning, dùng lại `services/content/planner.py`.
   - Thêm handler mới trong `services/content/handlers.py` (hoặc tạo module handler riêng theo modality).
   - Đăng ký handler trong `services/content/registry.py`.

4. **Thêm provider service**
   - Tạo `services/image_provider.py` hoặc `services/video_provider.py`.
   - Chịu trách nhiệm gọi external API và retry/polling.

5. **Thêm worker**
   - `services/image_worker.py` / `services/video_worker.py`.
   - Chỉ orchestration: set status, gọi planner/executor/provider, lưu kết quả, bắt lỗi.

6. **Thêm router**
   - `routers/image.py` / `routers/video.py`:
     - `POST /jobs`
     - `GET /jobs/{job_id}`
     - `GET /file/{job_id}` hoặc trả URL.

7. **Đăng ký router ở `main.py`**
   - `app.include_router(image.router)`.

## 5) Nguyên tắc mở rộng để tránh “code rối”

- Không import ngược từ `router` vào `service`.
- Logic nghiệp vụ chỉ nằm trong `services/*`.
- `router` chỉ validate request + trả response.
- Mỗi provider bên ngoài (TTS/image/video) nên có service riêng.
- Mọi job worker phải update trạng thái rõ ràng và lưu lỗi an toàn (`failed + error`).
- Tránh copy/paste helper; nếu helper dùng lại từ 2 nơi trở lên, chuyển vào `services/`.

## 6) Convention khi thêm subtype mới

Ví dụ thêm subtype `podcast` cho audio:

1. Tạo class handler mới trong `services/content/handlers.py`:
   - `subtype = "podcast"`
   - implement `render(plan, prompt)`.
2. Đăng ký handler vào `DEFAULT_HANDLERS`.
3. Cập nhật planner mapping để detect subtype nếu cần.
4. Bổ sung test case prompt -> output format mong muốn.

## 7) TODO khuyến nghị tiếp theo

- Tách SQLAlchemy models và Pydantic schemas thành file/module riêng.
- Thêm migration tool (Alembic) thay vì chỉ `create_all`.
- Thêm job cancel/retry endpoint.
- Thêm test tự động cho planner, executor và worker.

