# Kế hoạch Triển khai MVP 1: AI Content Generator

**Thời gian dự kiến:** 1 Tuần
**Mục tiêu:** Chứng minh luồng cốt lõi (Core Flow): Đăng nhập -> Tạo Project -> Nhập Prompt -> Gọi LLM -> Nhận & Xem lại kết quả.
**Công nghệ:** NextJS (FE), FastAPI (BE), PostgreSQL (DB).

---

## 1. Thiết kế Database Tối giản (Minified Schema)

Cho MVP 1, chúng ta chỉ cần 2 bảng cơ bản trên PostgreSQL (Supabase):

*   **Bảng `Users`:**
    *   `id` (UUID, Primary Key)
    *   `email` (String, Unique)
    *   `password_hash` (String)
    *   `created_at` (Timestamp)
*   **Bảng `Projects`:**
    *   `id` (UUID, Primary Key)
    *   `user_id` (UUID, Foreign Key -> Users.id)
    *   `title` (String) - Tên dự án (Ví dụ: "Truyện kiếm hiệp 1")
    *   `prompt` (Text) - Nội dung người dùng yêu cầu.
    *   `content` (Text) - Kết quả do AI sinh ra.
    *   `created_at` (Timestamp)
    *   `updated_at` (Timestamp)

*(Lưu ý: Vì yêu cầu MVP 1 KHÔNG có chương hồi và giữ context nhiều lần, nên nội dung prompt và kết quả sinh ra có thể được lưu trực tiếp vào bảng `Projects` luôn).*

---

## 2. Danh sách API Endpoints cần có (Backend FastAPI)

| Endpoint | Method | Chức năng | Authentication |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | POST | Tạo tài khoản mới. | No |
| `/api/auth/login` | POST | Xác thực và trả về JWT Token. | No |
| `/api/projects` | GET | Lấy danh sách toàn bộ project của User. | Yes (JWT) |
| `/api/projects` | POST | Tạo một project mới (Và gọi AI để sinh content). | Yes (JWT) |
| `/api/projects/{id}` | GET | Lấy chi tiết một project (để xem lại nội dung cũ). | Yes (JWT) |

---

## 3. Danh sách Task Backend (FastAPI)

1.  **Thiết lập base Project:** Init repo, cài đặt FastAPI, Uvicorn, SQLAlchemy, Pydantic.
2.  **Kết nối Database:** Cấu hình kết nối tới Supabase PostgreSQL qua biến môi trường (Connection string).
3.  **Authentication Migration:** Xây dựng cơ chế mã hóa mật khẩu (Passlib/Bcrypt) và sinh JWT Token (PyJWT). Viết 2 API Register/Login.
4.  **Middleware/Dependencies:** Viết một Dependency function (`get_current_user`) để bảo vệ các endpoints yêu cầu đăng nhập bằng cách verify JWT.
5.  **Tích hợp AI SDK:** Cài đặt thư viện của nhà cung cấp LLM (như `openai` hoặc `google-generativeai`). Viết hàm gọi API nhận prompt và trả text.
6.  **Xử lý API Projects:**
    *   Viết logic cho API GET list projects (chỉ trả về của user hiện tại).
    *   Viết logic cho API POST project: Nhận `title` và `prompt` từ FE -> Chèn `prompt` gọi hàm SDK AI chờ kết quả -> Lưu `title`, `prompt`, `content` (kết quả AI) và `user_id` vào Database -> Trả response về FE.
    *   Viết logic cho API GET chi tiết project theo `id`.

---

## 4. Danh sách Task Frontend (NextJS)

1.  **Thiết lập base Project:** `npx create-next-app@latest`, sử dụng TailwindCSS, App Router.
2.  **Quản lý State & Auth:** Viết cơ chế lưu JWT Token vào `localStorage` (hoặc Curent Cookies). Tạo Context/Store đơn giản để biết user đã đăng nhập hay chưa.
3.  **UI - Authentication:** Tạo 2 trang:
    *   `/login`: Form Đăng nhập.
    *   `/register`: Form Đăng ký.
    *   *Luồng:* Submit thành công -> Lưu Token -> Chuyển hướng sang `/dashboard`.
4.  **UI - Xây dựng Layout (Protected):** Tạo Layout Navigation (Header có nút Logout). Nếu user chưa có token, đá văng ra `/login`.
5.  **UI - Dashboard Project List:**
    *   Trang `/dashboard`: Gọi API GET danh sách projects. Render danh sách dạng List hoặc Card. Mỗi card có Title và Link vào chi tiết.
    *   Có nút "Tạo Project Mới".
6.  **UI - Trang Tạo / Sinh Nội Dung:**
    *   Trang `/dashboard/new`: Form gồm 1 input `Tên Dự Án` và 1 textarea `Nhập yêu cầu (Prompt)`.
    *   Nút "Generate".
    *   *Luồng:* Khi bấm Generate -> Hiện Loading -> Gọi API POST '/api/projects' -> Nếu thành công, chuyển hướng thẳng sang trang xem chi tiết dự án đó.
7.  **UI - Trang Xem Chi Tiết:**
    *   Trang `/dashboard/[id]`: Gọi API GET chi tiết. Render `Title`, hiển thị lại cục `Prompt` và cục kết quả `Content` đã lưu.

---

## 5. Lộ trình Triển khai (Timeline 1 Tuần)

*   **Ngày 1: Setup & Database:**
    *   Khởi tạo repo GitHub chung hoặc 2 repo FE/BE riêng.
    *   Tạo tài khoản Supabase, chạy script tạo bảng `Users` và `Projects`.
    *   Init code FastAPI base.
*   **Ngày 2: Backend Auth:**
    *   Hoàn thiện mã hóa pass, JWT. Xong 2 API `/register` và `/login`. Test bằng Postman.
*   **Ngày 3: Frontend Auth:**
    *   Init NextJS. Xây dựng trang Đăng nhập/Đăng ký. Gắn API BE chạy thử luồng lưu Token.
*   **Ngày 4: Backend Core Function & AI:**
    *   Tích hợp SDK gọi LLM.
    *   Viết xong 3 API CRUD cho bảng Projects, gắn bảo mật Dependency JWT. Test Postman kỹ luồng sinh nội dung và lưu DB.
*   **Ngày 5: Frontend Core Function:**
    *   Làm trang Dashboard liệt kê Project. Làm trang Add New nhập Prompt gọi API.
*   **Ngày 6: Hoàn thiện UI & Read Data:**
    *   Làm trang hiển thị chi tiết nội dung (xem lại các content cũ).
    *   Test End-to-End toàn bộ luồng ở localhost để kiểm tra việc Reload trang không bị mất content.
*   **Ngày 7: Deploy & Testing:**
    *   Mở Vercel (kết nối repo FE), Render (kết nối repo BE). Cấu hình MÔI TRƯỜNG (Domain BE, Supabase URL, AI Keys, JWT Secret) trên cả 2 nền tảng.
    *   Deploy, lấy link thật đi dợt kịch bản Demo.

---

## 6. Kịch bản Luồng Demo (Cho Giảng Viên)

*Giả định đã chạy public demo link.*

Khởi đầu, mở sẵn trang đăng nhập.

1.  **Bước 1 - Vào vai người dùng mới:** Trình bày "Em xin phép trình bày hệ thống với tư cách là một người sáng tạo nội dung mới". Bấm sang form Đăng ký -> Nhập email/pass (vd: `demo@test.com` / `123123`) -> Submit đăng ký thành công.
2.  **Bước 2 - Đăng nhập & Bảng điều khiển:** Chuyển qua Đăng nhập -> Điền đúng tài khoản -> Chuyển vào trang Dashboard đang Trống. Nhấn mạnh: "Đây là trang quản lý độc lập theo từng tài khoản, dữ liệu hoàn toàn tách biệt."
3.  **Bước 3 - Tạo nội dung lần đầu (Core Logic):** Bấm "Tạo AI Project" -> Điền Tiêu đề: *Kịch bản Clip Nấu Ăn ngắn* -> Form Prompt điền: *Viết cho tôi một kịch bản clip TikTok dưới 60 giây hướng dẫn làm món trứng chiên nước mắm.*
4.  **Bước 4 - Generate & Kết quả:** Bấm Generate, trình bày đang gọi API sang LLM. Màn hình loading chớp tắt, chuyển sang trang Chi tiết hiển thị đoạn nội dung AI vừa trả về rất chi tiết.
5.  **Bước 5 - Chứng minh tính lưu trữ (Yêu cầu đề):** Nhấn **F5 (Reload Trang)** ngay tại trang chi tiết -> Giao diện vẫn render y nguyên Text kết quả. Bấm phím **Back (Quay lại)** mũi tên trình duyệt ra Dashboard -> Hiển thị 1 project "Kịch bản Clip Nấu Ăn ngắn". Bấm click vào lại project đó -> Nó load ra nội dung cũ.
6.  **Bước 6 (Optional) - Chứng minh bảo mật:** Đăng xuất ra -> Đăng nhập bằng tài khoản khác -> Trang Dashboard Trống. Không xem được project nấu ăn kia.

Xong. Đây là luồng MVP1 tinh gọn, tập trung thẳng vào trọng tâm nhất. 
