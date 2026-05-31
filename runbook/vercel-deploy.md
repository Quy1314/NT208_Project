# Hướng dẫn deploy Backend và Frontend lên Vercel

Tài liệu này hướng dẫn deploy project gồm:

- `backend/`: FastAPI API
- `frontend/`: Next.js app

Khuyến nghị deploy thành **2 Vercel projects riêng**:

1. `nt-208-backendg4` / backend FastAPI
2. frontend Next.js project riêng

Backend production hiện tại:

```text
https://nt-208-backendg4.vercel.app
```

Cách này dễ cấu hình environment variables, domain và CORS hơn.

---

## 1. Chuẩn bị trước khi deploy

### 1.1. Đẩy code lên GitHub

```bash
git status
git add .
git commit -m "Add Vercel deployment runbook"
git push origin main
```

### 1.2. Kiểm tra các file không được commit

Không commit các file/folder sau:

- `.env`, `.env.local`
- `.venv/`, `node_modules/`, `.next/`
- `backend/uploads/`, `backend/outputs/`
- file test local hoặc file sinh tự động

### 1.3. Chuẩn bị biến môi trường

Mở file local:

- `backend/.env`
- `frontend/.env.local`

Copy các key cần thiết để nhập vào Vercel.

> Lưu ý: Không paste secret trực tiếp vào code hoặc README public.

---

## 2. Deploy Backend FastAPI lên Vercel

### 2.1. Tạo project backend trên Vercel

1. Vào <https://vercel.com/new>
2. Import GitHub repository của project.
3. Ở bước cấu hình project:
   - **Project Name**: `nt-208-backendg4` hoặc tên backend riêng.
   - **Framework Preset**: `Other`
   - **Root Directory**: để root repo, không chọn `backend/`
4. Deploy lần đầu có thể fail nếu chưa có file cấu hình `vercel.json`; làm tiếp bước dưới.

### 2.2. Tạo file `vercel.json` cho backend

Tạo file ở **root repository**:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "backend/main.py"
    }
  ]
}
```

Sau đó commit và push:

```bash
git add vercel.json
git commit -m "Add Vercel backend config"
git push origin main
```

### 2.3. Cấu hình Python dependencies

Vercel Python builder sẽ đọc `requirements.txt` ở root repository.

Project hiện có file:

```text
requirements.txt
```

Nếu deploy báo thiếu package, thêm package vào `requirements.txt`, commit và push lại.

### 2.4. Cấu hình Environment Variables cho backend

Vào Vercel project backend:

```text
Settings → Environment Variables
```

Thêm các biến từ `backend/.env`, ví dụ thường gặp:

```text
DATABASE_URL=...
SECRET_KEY=...
ALGORITHM=...
ACCESS_TOKEN_EXPIRE_MINUTES=...
FAL_KEY=...
HF_TOKEN=...
```

Tên biến phải khớp với code backend đang đọc bằng `os.getenv(...)` hoặc `load_dotenv()`.

Sau khi thêm biến môi trường, chọn:

```text
Deployments → Redeploy
```

### 2.5. Kiểm tra backend sau khi deploy

Sau khi deploy thành công, Vercel sẽ cấp domain dạng:

```text
https://project-ai-agent-backend.vercel.app
```

Test các endpoint:

```bash
curl https://nt-208-backendg4.vercel.app/
curl https://nt-208-backendg4.vercel.app/test-db
```

Nếu dùng domain preview hoặc project khác, thay URL bằng domain backend tương ứng.

Kết quả mong muốn:

```json
{"message":"Welcome to the AI Content Generator API"}
```

và `/test-db` trả về kết nối database thành công.

---

## 3. Cấu hình CORS backend cho frontend production

Backend hiện chỉ allow localhost. Khi deploy frontend, cần thêm domain frontend production vào CORS.

Trong `backend/main.py`, cập nhật `allow_origins` gồm domain Vercel frontend:

```python
allow_origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://project-ai-agent-frontend.vercel.app",
]
```

Sau đó commit, push và redeploy backend.

> Nếu dùng custom domain, thêm custom domain đó vào `allow_origins`.

---

## 4. Deploy Frontend Next.js lên Vercel

### 4.1. Tạo project frontend trên Vercel

1. Vào <https://vercel.com/new>
2. Import cùng GitHub repository.
3. Ở bước cấu hình project:
   - **Project Name**: `project-ai-agent-frontend`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `frontend`
   - **Install Command**: `npm install`
   - **Build Command**: `npm run build`
   - **Output Directory**: giữ mặc định

### 4.2. Cấu hình Environment Variables cho frontend

Vào Vercel project frontend:

```text
Settings → Environment Variables
```

Code frontend hiện đọc biến `NEXT_PUBLIC_API_URL` trong [api.ts](file:///c:/Documentss/LtrinhWeb/Project_AI_Agent/frontend/src/lib/api.ts):

```text
NEXT_PUBLIC_API_URL=https://nt-208-backendg4.vercel.app
```

> Với Next.js, biến môi trường dùng trong browser phải bắt đầu bằng `NEXT_PUBLIC_`.
>
> Sau khi đổi `NEXT_PUBLIC_API_URL`, phải **Redeploy frontend** vì biến này được bake vào bundle lúc build.

### 4.3. Deploy frontend

Sau khi cấu hình xong, bấm:

```text
Deploy
```

Hoặc nếu đã deploy trước đó:

```text
Deployments → Redeploy
```

### 4.4. Kiểm tra frontend production

Mở domain frontend:

```text
https://project-ai-agent-frontend.vercel.app
```

Kiểm tra:

- Trang load được không.
- Đăng nhập/đăng ký hoạt động không.
- Các API call không bị lỗi CORS.
- Console browser không có lỗi `Failed to fetch` hoặc `CORS policy`.

---

## 5. Lưu ý quan trọng khi dùng Vercel cho backend FastAPI

Vercel Serverless không phù hợp để lưu file lâu dài trong local filesystem.

Quan trọng:

- Bundle deploy của Vercel là read-only.
- Không được tạo/ghi thư mục như `outputs/`, `uploads/` trong root app khi chạy production.
- Chỉ thư mục `/tmp` là writable, nhưng **ephemeral** và có thể mất giữa cold start/redeploy.

Project hiện đã xử lý runtime path trong backend để khi có biến `VERCEL=1` thì ghi tạm vào:

```text
/tmp/outputs
/tmp/uploads/audio
```

Các folder local như:

```text
backend/uploads/
backend/outputs/
```

vẫn chỉ nên dùng cho development và không dùng làm persistent storage production.

Nếu app cần lưu ảnh/audio/video, nên dùng storage ngoài:

- Supabase Storage
- Cloudinary
- S3-compatible storage
- Firebase Storage

### 5.2. Tác vụ xử lý lâu có thể timeout

Các tác vụ AI/video/audio lâu có thể vượt timeout của Vercel Serverless Functions.

Nếu gặp timeout, cân nhắc chuyển backend sang:

- Render
- Railway
- Fly.io
- Google Cloud Run

và vẫn giữ frontend trên Vercel.

### 5.3. SQLite không phù hợp production trên Vercel

Nếu local dùng `dev.db`, không dùng file SQLite này cho production Vercel.

Production nên dùng database ngoài như:

- Supabase PostgreSQL
- Neon PostgreSQL
- Railway PostgreSQL

---

## 6. Quy trình update sau này

Mỗi lần sửa code:

```bash
git status
git add .
git commit -m "Your change message"
git push origin main
```

Vercel sẽ tự động deploy lại project tương ứng.

Nếu chỉ sửa backend:

- Backend project redeploy.
- Frontend không cần redeploy, trừ khi đổi API URL hoặc code frontend.

Nếu chỉ sửa frontend:

- Frontend project redeploy.
- Backend không cần redeploy.

---

## 7. Checklist deploy nhanh

### Backend

- [ ] Có `vercel.json` ở root repo.
- [ ] `requirements.txt` đầy đủ package.
- [ ] Đã nhập environment variables trong Vercel backend project.
- [ ] Không ghi file vào root app; runtime temp file dùng `/tmp` trên Vercel.
- [ ] `/` trả về welcome message.
- [ ] `/test-db` kết nối database thành công.
- [ ] CORS đã allow domain frontend production.

### Frontend

- [ ] Root Directory trên Vercel là `frontend`.
- [ ] Framework Preset là `Next.js`.
- [ ] Đã nhập `NEXT_PUBLIC_*` API URL.
- [ ] `npm run build` pass trên Vercel.
- [ ] Web production gọi API backend thành công.

---

## 8. Troubleshooting

### Lỗi CORS

Triệu chứng:

```text
Access to fetch at ... has been blocked by CORS policy
```

Cách sửa:

1. Copy domain frontend production.
2. Thêm vào `allow_origins` trong `backend/main.py`.
3. Commit, push và redeploy backend.

### Lỗi `ModuleNotFoundError`

Cách sửa:

1. Xác định package thiếu.
2. Thêm vào `requirements.txt`.
3. Commit, push và redeploy backend.

### Lỗi database connection failed

Kiểm tra:

- `DATABASE_URL` trên Vercel đúng chưa.
- Database có allow connection từ internet không.
- SSL mode có cần bật không.
- Migration/schema đã được tạo chưa.

### Frontend gọi nhầm localhost

Triệu chứng:

```text
Failed to fetch http://localhost:8000/...
```

Cách sửa:

1. Đảm bảo frontend dùng biến `NEXT_PUBLIC_API_URL` cho base API URL.
2. Set biến đó trên Vercel frontend project:

   ```text
   NEXT_PUBLIC_API_URL=https://nt-208-backendg4.vercel.app
   ```

3. Redeploy frontend.

### Lỗi `OSError: [Errno 30] Read-only file system`

Triệu chứng trong Vercel logs:

```text
OSError: [Errno 30] Read-only file system: 'outputs'
OSError: [Errno 30] Read-only file system: 'uploads'
```

Nguyên nhân:

- Vercel Serverless không cho ghi vào bundle app/root repo lúc runtime.
- Code tạo thư mục hoặc ghi file vào `outputs/`, `uploads/` tại root sẽ crash.

Cách sửa:

1. Không gọi `os.makedirs("outputs")` hoặc `os.makedirs("uploads/...")` trực tiếp tại root app khi chạy trên Vercel.
2. Dùng helper kiểm tra `os.getenv("VERCEL")` và chuyển runtime write path sang `/tmp`.
3. Nếu file cần lưu lâu dài, chuyển sang Supabase Storage, S3, Cloudinary hoặc Firebase Storage.
4. Commit, push và chờ Vercel redeploy.

### Lỗi `ModuleNotFoundError` cho module nội bộ

Ví dụ:

```text
ModuleNotFoundError: No module named 'database'
```

Cách sửa:

1. Kiểm tra import trong backend khi chạy từ entrypoint `backend/main.py`.
2. Ưu tiên dùng package import rõ ràng, ví dụ `from backend.database import ...`, hoặc đảm bảo `sys.path`/package layout tương thích Vercel.
3. Test local bằng import mô phỏng production:

   ```bash
   python -c "import os; os.environ['VERCEL']='1'; import backend.main"
   ```

4. Commit, push và redeploy backend.
