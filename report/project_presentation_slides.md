# AI Content Generator Platform - Presentation Slides

This document is formatted as a Markdown presentation (Marp-compatible) to help you easily build slides for the project. Each slide is separated by `---`.

---

<!-- _class: lead -->
# 🚀 AI CONTENT GENERATOR PLATFORM
## Hệ Thống Sáng Tác Nội Dung Đa Phương Tiện Nhất Quán (NT208)

**Thành viên thực hiện:** [Tên Nhóm]  
**Môn học:** Phát Triển Ứng Dụng Web (NT208)

---

## 👥 1. Đối Tượng Sử Dụng Mục Tiêu (Target Users)

*   **✍️ Nhà văn, tác giả tự do (Indie Writers / Novelists):**
    *   Sáng tác tiểu thuyết mạng, truyện dài kỳ.
    *   Cần độ nhất quán cao về cốt truyện, tính cách và diện mạo nhân vật qua hàng chục chương.
*   **🎬 Người sáng tác nội dung video (Content Creators):**
    *   TikTokers, YouTubers làm video kể chuyện, hoạt hình ngắn.
    *   Cần tích hợp nhanh: Kịch bản ➡️ Giọng đọc ➡️ Ảnh minh họa ➡️ Phân cảnh video.
*   **🎨 Biên kịch truyện tranh & Webtoon:**
    *   Viết kịch bản phân cảnh, lời thoại cho họa sĩ minh họa.
    *   Cần tạo ảnh phác thảo (Concept Art) định hướng hình ảnh.
*   **🎮 Nhà phát triển game độc lập (Indie Game Devs):**
    *   Xây dựng cốt truyện nền (Lore), lời thoại cho lượng lớn nhân vật/NPC.

---

## 🎯 2. Nhu Cầu Cốt Lõi & Giải Pháp (User Needs)

| Vấn đề của người dùng (Pain Points) | Giải pháp của Hệ thống (Our Solutions) |
| :--- | :--- |
| **Mất nhất quán cốt truyện** <br> (AI phổ thông bị trôi ngữ cảnh khi viết dài) | **Engine Độc Lập & RAG** <br> Quản lý Canon Scope (Lore Chunks) để ghi nhớ nhân vật/bối cảnh dài hạn. |
| **Quy trình rời rạc** <br> (Phải dùng riêng lẻ ChatGPT, Midjourney, TTS...) | **Workspace Đa Phương Tiện Tích Hợp** <br> Viết text, sinh ảnh, phát âm thanh và video trong 1 cửa sổ. |
| **Quản lý hội thoại lộn xộn** <br> (Dạng chat dài không có cấu trúc dự án) | **Quản lý theo Dự án (Project-Based)** <br> Lưu trữ dạng Project, quản lý lịch sử thông minh. |
| **Hợp tác đội nhóm thủ công** <br> (Chia sẻ tài liệu qua file text rời rạc) | **Không gian cộng tác nhóm (Teams)** <br> Chia sẻ tài nguyên và dùng chung API Key trong nhóm. |

---

## 💡 3. Các Tính Năng Core Hệ Thống (Key Features)

*   **📝 Creative Writing Engine (Text):**
    *   Viết kịch bản/truyện dài kỳ đa ngôn ngữ (Việt/Anh).
    *   Streaming nội dung thời gian thực.
*   **🖼️ Concept Art Generator (Image):**
    *   Tạo hình ảnh nhân vật, bối cảnh với FLUX.1 & Stable Diffusion.
*   **🔊 Text-to-Speech (Audio):**
    *   Chuyển đổi kịch bản thành giọng đọc truyền cảm bằng FPT AI TTS v5.
*   **🎥 Scene Generator (Video):**
    *   Tạo phân cảnh video ngắn chuyển động mượt mà từ prompt qua Fal/Kling.
*   **🏷️ Auto-Naming & Video Saving:**
    *   Tự động đặt tên dự án bằng AI thông minh (thay thế "AI Template Draft").
    *   Lưu trữ lịch sử chat video, phát lại và tiếp tục sinh video trên dự án cũ.

---

## 🛠️ 4. Kiến Trúc Kỹ Thuật (System Architecture)

```mermaid
graph TD
    Client[React / Next.js SPA] <--> |REST API & Stream SSE| API[FastAPI Web Server]
    API <--> |SQLAlchemy ORM| DB[(PostgreSQL / SQLite)]
    API --> |Story Grounding Context| RAG[Canon Scope Engine]
    API --> |External AI Services| HF[Hugging Face Inference API]
    API --> |TTS API| FPT[FPT AI Voice Cloud]
    API --> |Video API| Fal[Fal AI / Kling AI SDK]
```


---

## 🛠️ 4b. Cấu Trúc Tương Tác Tổng Quát (Interaction Flow)

*   **🔄 Đồng bộ hóa & Luồng giao tiếp chính:**
    *   **Client ➡️ Server:** Dùng HTTP REST API (đăng nhập, quản lý project/team, cập nhật metadata) & Server-Sent Events (SSE) để stream nội dung chữ dài từ LLM.
    *   **Server ➡️ DB:** Sử dụng SQLAlchemy ORM để truy vấn và lưu giữ tài nguyên.
    *   **Server ➡️ AI Engines:** Hoạt động như một Gateway Điều Phối (Orchestrator). Nhận yêu cầu từ người dùng, làm giàu ngữ cảnh (context enrichment) rồi gửi tiếp đến bên thứ ba.
*   **💾 Quản lý trạng thái ở Frontend:**
    *   Lưu giữ JWT Token tại Local Storage/Session Storage để giữ phiên làm việc.
    *   Phân tích cú pháp trạng thái (ví dụ: chuyển project content thành chat thread video/audio) để cập nhật UI phản hồi tương ứng mà không cần reload trang.

---

## 🔄 4c. Luồng Hoạt Động Chi Tiết (Activity Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as Giao diện Web (Next.js)
    participant API as FastAPI Backend
    participant DB as Database
    participant AI as Dịch vụ AI (Hugging Face/Fal/FPT)

    User->>UI: Nhập Prompt & nhấn gửi
    UI->>API: Gửi yêu cầu sinh nội dung (Token + Payload)
    API->>DB: Truy vấn Canon Scope & Ngữ cảnh lịch sử (RAG)
    DB-->>API: Trả về Lore Chunks phù hợp
    API->>API: Đóng gói & làm giàu Prompt
    API->>AI: Gọi API sinh (Text/Image/Audio/Video)
    AI-->>API: Trả về kết quả (Text Stream/URL)
    API->>DB: Lưu trữ nội dung mới vào Project.content
    API-->>UI: Stream/Trả kết quả hoàn chỉnh về Client
    UI->>User: Cập nhật Sidebar & Hiển thị trên Workspace
```

---

## 💻 5. Công Nghệ Sử Dụng (Technology Stack)

*   **Frontend (Ứng dụng Web):**
    *   **Core:** React 19, Next.js 16 (App Router).
    *   **Styling & UI:** TailwindCSS, Tailwind Merge, Lucide Icons, Shadcn UI.
*   **Backend (Máy chủ dịch vụ API):**
    *   **Framework:** Python FastAPI.
    *   **Database & ORM:** PostgreSQL/SQLite, SQLAlchemy ORM.
*   **Tích hợp AI Models:**
    *   **Text LLM:** Qwen/Qwen2.5-72B-Instruct, Llama (qua HF Inference Client).
    *   **Image:** black-forest-labs/FLUX.1-schnell, Stability AI SDXL.
    *   **Audio:** FPT TTS AI v5 Engine.
    *   **Video:** fal-ai/minimax-video, Kling AI.

---

## 🌟 6. Điểm Nhấn Sáng Tạo (What Makes Us Unique?)

1.  **Tính nhất quán tuyệt đối nhờ RAG (Retrieval-Augmented Generation):**
    *   Hệ thống không chỉ gửi prompt đơn thuần mà tự động truy vấn Lore Chunks từ cơ sở dữ liệu để đóng gói ngữ cảnh đầy đủ nhất gửi tới LLM.
2.  **Trải nghiệm người dùng cao cấp (Premium UI/UX):**
    *   Thiết kế Dark/Light mode hiện đại, bo góc mềm mại, các hiệu ứng glassmorphism thời thượng.
    *   Trình soạn thảo composer gọn gàng hỗ trợ upload file tài liệu đính kèm và nhận diện giọng nói (Speech-to-Text).
3.  **Tự động hóa thông minh (Automated Smart Helpers):**
    *   Nút "Tự đặt tên" gọi LLM tóm tắt nhanh prompt của người dùng thành tên dự án ngắn gọn (2-4 từ).

---

<!-- _class: lead -->
# Thank You!
## 📧 Q&A - Hỏi đáp về hệ thống
