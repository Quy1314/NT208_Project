# VieNeu-TTS v3 Turbo Service

Triển khai TTS với VieNeu-TTS v3 Turbo (ONNX, CPU).

## Deploy lên Render

1. Push code này lên GitHub
2. Vào [render.com](https://render.com) → New Web Service → chọn repo
3. Set:
   - **Root Directory**: `tts_service`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 10000`
   - **Instance Type**: Free (512MB)
4. Deploy → đợi 5-10p lần đầu (tải model ~500MB)
5. Copy URL (dạng `https://vieneu-tts.onrender.com`)

## Deploy lên Hugging Face Spaces (nếu Render OOM)

1. Vào [huggingface.co/new-space](https://huggingface.co/new-space)
2. Chọn **Docker** SDK, **CPU Basic** (16GB RAM, free)
3. Upload files trong thư mục này + Dockerfile:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
```

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/health` | Check status + list default voices |
| `POST` | `/generate?text=...&voice=...` | Tạo audio |

## Ví dụ

```bash
curl "https://vieneu-tts.onrender.com/health"
curl -X POST "https://vieneu-tts.onrender.com/generate?text=Xin+chào+các+bạn&voice=Bình+An"
```
