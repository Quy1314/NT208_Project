# AI Content Generator Platform

## 📌 Giới thiệu dự án

**🎯 Nền tảng hỗ trợ tạo nội dung đa phương tiện theo dự án**

Đây là hệ thống quản lý và hỗ trợ người dùng tạo, phát triển nội dung đa phương tiện theo cấu trúc dài hạn. Nền tảng cho phép quản lý nội dung chuyên sâu theo từng tài khoản và dự án riêng biệt, đảm bảo duy trì mạch văn, ngữ cảnh và tính nhất quán xuyên suốt quá trình sáng tạo.

Hệ thống được thiết kế tối ưu để hỗ trợ đa dạng các loại hình nội dung:
- 📖 Truyện ngắn, tiểu thuyết dài kỳ
- 🎨 Kịch bản truyện tranh (Comic/Webtoon)
- 🎬 Kịch bản video/clip (Youtube/TikTok)
- 🎵 Lời bài hát (Lyrics)

Khác biệt với các công cụ tạo nội dung AI đơn lẻ (dạng chat 1 lần), hệ thống của chúng tôi hoạt động theo **mô hình quản lý dự án**. Mỗi người dùng có thể sở hữu nhiều dự án song song. Trong đó, nội dung được tổ chức, lưu trữ và phát triển nối tiếp theo từng giai đoạn, từng chương hoặc từng phiên bản cụ thể.

## 🧩 Mục tiêu dự án

- **Cá nhân hóa quản lý:** Xây dựng hệ thống quản lý nội dung đa phương tiện độc lập theo từng tài khoản người dùng.
- **Tính liên tục (Long-context):** Đảm bảo nội dung có thể được AI hỗ trợ phát triển tiếp nối mà không bị đứt đoạn hay mất mát thông tin ngữ cảnh cũ.
- **Lưu trữ chuẩn mực:** Thiết kế cơ sở dữ liệu có cấu trúc tối ưu, phục vụ việc lưu vết, truy xuất lịch sử nội dung và prompt một cách nhanh chóng.
- **Kiến trúc bền vững:** Áp dụng các tiêu chuẩn kiến trúc web hiện đại, đảm bảo tính ổn định, dễ dàng mở rộng (scale) và bảo trì trong tương lai.

## 🏗 Kiến trúc hệ thống

Hệ thống được phát triển dựa trên mô hình Client - Server hiện đại, phân tách rõ ràng giữa giao diện hiển thị và logic xử lý nghiệp vụ:

- **Frontend:** Next.js (React Framework)
- **Backend:** FastAPI (Python)
- **Cơ sở dữ liệu:** PostgreSQL
- **Hạ tầng triển khai (Deployment):** 
  - Vercel (Frontend)
  - Render (Backend)
  - Supabase (Database)

*Thiết kế kiến trúc này giúp hệ thống hoạt động với hiệu suất cao, dễ dàng kiểm thử, bảo trì và hoàn toàn phù hợp với các mô hình triển khai Microservices hay Cloud-native thực tế.*

## 🔎 Điểm nổi bật của hệ thống

1. **Quản lý theo dự án (Project-based):** Tổ chức dữ liệu theo dự án mang tính hệ thống thay vì các phiên làm việc (sessions) tạm thời dễ mất.
2. **Context-Awareness:** Lưu trữ và truy xuất lịch sử nội dung thông minh theo tài khoản, giúp AI "nhớ" được cốt truyện và nhân vật.
3. **Đa dạng hóa nội dung (Multimodal Text):** Hỗ trợ linh hoạt nhiều loại hình format nội dung ngay trong cùng một nền tảng thống nhất.
4. **Cơ sở dữ liệu linh hoạt:** Thiết kế schema có tính tổ chức cao, sẵn sàng cho việc mở rộng thêm tính năng (như chia sẻ, làm việc nhóm) trong các giai đoạn sau.