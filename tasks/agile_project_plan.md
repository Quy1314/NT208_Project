# Kế hoạch Triển khai Nền tảng AI Content Generator (Agile)

**Mô tả:** Hệ thống hỗ trợ tạo nội dung từ AI đa phương tiện (story, novel, truyện tranh, script, lyrics), quản lý dự án dài kỳ, tự động lưu và duy trì ngữ cảnh theo từng user.  
**Tech Stack:** NextJS (Vercel), FastAPI (Render), PostgreSQL (Supabase), GitHub ([https://github.com/Quy1314/NT208_Project.git](https://github.com/Quy1314/NT208_Project.git)).

---

## 📅 Tổng quan các Sprints (5 Sprints)
*Độ dài mỗi sprint: 1-2 tuần tuỳ nguồn lực.*

### 🏃 Sprint 1: Khởi tạo Nền tảng & Định danh (Foundation & Auth)
**Mục tiêu:** Xây dựng khung kiến trúc server/client, định nghĩa Database Schema và luồng Đăng nhập.

*   **Task bắt buộc:**
    *   Khởi tạo repopsitory GitHub cho NextJS và FastAPI.
    *   Thiết lập Supabase (PostgreSQL), kết nối database với FastAPI (SQLAlchemy/Alembic).
    *   Thiết kế CSDL: Bảng `Users`, `Projects`.
    *   Viết API Đăng ký, Đăng nhập (JWT Token).
    *   Thiết kế giao diện Frontend cơ bản: Layout, Login/Register pages, Protected routes.
*   **Task nâng cao (Điểm cộng):** 
    *   Đăng nhập bằng Google Auth (OAuth2 qua Supabase).
*   **Sản phẩm có thể demo (MVP 1):** 
    *   Người dùng có thể tạo tài khoản, đăng nhập thành công và truy cập vào trang Dashboard trống trên Frontend.

---

### 🏃 Sprint 2: Quản lý Dự án & Tích hợp LLM cơ bản (Project CRUD & AI Base)
**Mục tiêu:** Cho phép người dùng tạo các phân mục nội dung của mình và giao tiếp được với AI.

*   **Task bắt buộc:**
    *   Thiết kế CSDL: Bảng `Prompts_History`, `Project_Settings` (Thể loại: story, comic, kịch bản...).
    *   API Backend CRUD Dự án (Tạo mới, Sửa, Xóa, Liệt kê).
    *   Tích hợp SDK gọi hàm API của LLM (OpenAI / Anthropic / Gemini) tại FastAPI.
    *   Frontend: Trang Dashboard liệt kê project, Trang tạo Project, Form nhập prompt đầu tiên.
*   **Task nâng cao (Điểm cộng):** 
    *   Tự động Generate tên Project / Thumbnail bằng AI dựa trên prompt đầu vào nếu user bỏ trống.
*   **Sản phẩm có thể demo (MVP 2):** 
    *   User tạo được một dự án truyện, nhập yêu cầu và AI trả về đoạn hội thoại/nội dung text đầu tiên (tại thời điểm này chưa nối ngữ cảnh dài).

---

### 🏃 Sprint 3: Quản lý Chương hồi & Khả năng Duy trì Ngữ Cảnh (Chapters & Context Keeping)
**Mục tiêu:** Giải quyết core value của hệ thống - Lưu giữ bối cảnh để AI sinh nội dung mới không bị quên phần cũ.

*   **Task bắt buộc:**
    *   Thiết kế CSDL: Bảng `Chapters` (thuộc Projects).
    *   Backend logic: Khi người dùng request tạo "Chương tiếp theo", Backend query toàn bộ lịch sử nội dung thuộc project -> Ghép vào System Prompt/History Messages -> Gửi lên LLM.
    *   Frontend: Giao diện soạn thảo dạng Master-Detail (Bên trái: Danh sách các chương; Bên phải: Khung chat sinh nội dung và Edit zone cho nội dung).
*   **Task nâng cao (Điểm cộng):** 
    *   Tính năng "Chỉnh sửa kết quả của AI" (User có quyền edit text AI sinh ra, sau đó lưu text đã edit vào DB để lần tới AI dùng context chuẩn do user duyệt thay vì text thô của nó).
*   **Sản phẩm có thể demo (MVP 3):** 
    *   User sinh Chương 1 giới thiệu nhân vật A & B. User ra lệnh sinh Chương 2, AI nhớ chính xác A & B là ai mà không cần nhắc lại.

---

### 🏃 Sprint 4: Xử lý Ngữ Cảnh Dài & System Prompt theo Thể Loại (Long Context & Modality)
**Mục tiêu:** Đảm bảo hệ thống mượt mà khi lượng dữ liệu lớn dần, tối ưu hoá prompt cho đa thể loại.

*   **Task bắt buộc:**
    *   Xử lý Context Limit: Thuật toán Backend theo dõi số token/chữ. Nếu vượt giới hạn, tự động gọi 1 LLM request ẩn để **Tóm tắt (Summarize)** danh sách các chương cũ thành 1 đoạn cốt truyện (Lorebook) và chỉ đệm đoạn tóm tắt + 2 chương gần nhất vào Prompt.
    *   Xây dựng kho System Prompt động tuỳ Thể loại (Lyrics: xuất thơ; Comic: xuất kịch bản mô tả tranh...).
    *   Frontend: Thêm filter thể loại, cải thiện UI hiển thị theo loại (Ví dụ kịch bản clip hiện dạng Table, Story hiện dạng Text document).
*   **Task nâng cao (Điểm cộng):** 
    *   Xuất file (Export) toàn bộ Project ra định dạng PDF, Markdown hoặc Word.
*   **Sản phẩm có thể demo (MVP 4):** 
    *   Project có tới 20 chương nhưng AI vẫn nhớ cốt truyện tổng quan nhờ bản tóm tắt tự động, sinh ra bài hát chuẩn vần điệu hoặc kịch bản Youtube/Tiktok có chia cột Cảnh/Thoại.

---

### 🏃 Sprint 5: Deploy, Sửa lỗi & Hoàn thiện (Launch & Polish)
**Mục tiêu:** Đưa ứng dụng ra Internet, thiết lập luồng vận hành CI/CD.

*   **Task bắt buộc:**
    *   Deploy Frontend NextJS lên Vercel.
    *   Deploy Backend FastAPI lên Render.
    *   Gắn các biến môi trường (API Keys, Supabase credentials, JWT secrets) an toàn trên Vercel/Render.
    *   Testing luồng E2E cơ bản.
*   **Task nâng cao (Điểm cộng):** 
    *   Tích hợp Streaming API (Text hiện ra từ từ như ChatGPT thay vì chờ AI sinh xong toàn bộ mất 10-20 giây) - Tăng mạnh UX.
*   **Sản phẩm có thể demo (Final):** 
    *   Website live public hoàn thiện, hoạt động đúng yêu cầu bài toán. Người dùng trải nghiệm tạo tài khoản, khởi tạo dự án và tạo nội dung dài trên server thật mạng thật.
