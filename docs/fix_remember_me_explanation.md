# Hướng dẫn xử lý triệt để lỗi "Ghost Login" (Tự động điền Form) trên Next.js

## Vấn đề gặp phải
Khi xây dựng chức năng **"Remember Me"** cho trang Đăng nhập (`/login`), chúng ta gặp một lỗi "cứng đầu": Dù người dùng đã bấm **Đăng xuất (Logout)**, nhưng khi giao diện trang `/login` hiện ra, hai trường `Email` và `Password` vẫn bị **tự động điền đầy chữ** (Auto-fill) của phiên đăng nhập cũ. Điều này gây hiểu lầm nghiêm trọng về bảo mật và UX (Trải nghiệm người dùng), khiến họ tưởng tính năng Đăng xuất bị hỏng.

## Ba "thủ phạm" gây ra lỗi và cách khắc phục

Để sửa dứt điểm hiện tượng "bóng ma" này, chúng ta phải xử lý đồng thời 3 nguyên nhân ở 3 tầng khác nhau: 

### 1. Ở tầng State (Next.js Application State)
**Nguyên nhân:** Khi gọi hàm `<button onClick={handleLogout}>`, nếu chỉ dùng lệnh `router.push('/login')` của NextJS, framework này sẽ dùng cơ chế *Soft Navigation* (chuyển trang mềm). Nó không tải lại toàn bộ DOM HTML mà chỉ thay thế Component, dẫn đến việc cái Form cũ cùng với đám chữ chình ình trong State vẫn bị "tái chế" mang ra xài lại ở màn hình mới.
**Cách fix:** Trong file `src/app/page.tsx` (Dashboard), thay thế lệnh `router.push` bằng lệnh Native của trình duyệt:
```javascript
// Thay vì:
router.push('/login');

// Hãy dùng:
window.location.href = '/login'; 
```
Lệnh này sẽ trảm toàn bộ Cache DOM của NextJS và bắt ép trình duyệt phải xin lại 1 file HTML Login trắng tinh tươm từ Server.

### 2. Ở tầng Local Cache (LocalStorage vs SessionStorage)
**Nguyên nhân:** Ban đầu, dù người dùng có đánh dấu tích vào ô `Remember Me` hay không, thì Token đăng nhập và Email vẫn bị tống thẳng vào `localStorage`. Đặc điểm của `localStorage` là nó sống bất tử cho đến khi Code ra lệnh xóa hoặc bạn đi cài lại Win. 
**Cách fix:** Trong file `src/app/login/page.tsx`, chia lại luồng lưu trữ bài bản để kiểm soát chặt chẽ sinh tử của Token:
```javascript
if (rememberMe) {
    // Nếu Check "Remember me": Lưu vào ổ cứng bất tử (Sống sót khi đóng tab)
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("user_email", email);
    localStorage.setItem("remembered_email", email); // Custom: Nhớ email để dọn sẵn
} else {
    // Nếu KHÔNG Check: Chỉ lưu vào Session tạm thời (Chết ngay khi đóng tab)
    sessionStorage.setItem("access_token", data.access_token);
    sessionStorage.setItem("user_email", email);
    localStorage.removeItem("remembered_email");
}
```
Lúc bạn viết code `handleLogout` ở Dashboard, nhớ phải dọn dẹp sạch sẽ cả 2 thùng rác này:
```javascript
// File: src/app/page.tsx -> handleLogout()
localStorage.removeItem("access_token");
localStorage.removeItem("user_email");
sessionStorage.removeItem("access_token");
sessionStorage.removeItem("user_email");
```

### 3. Ở tầng Browser (Google Password Manager)
**Nguyên nhân:** Đôi khi code của bạn dọn sạch sẽ rồi, NextJS cũng rỗng ruột rồi, nhưng bạn xài Google Chrome. Lúc bạn vừa đáp cánh xuống `/login`, trình duyệt nhảy ra giành quyền kiểm soát: *"Ê tao nhớ mày từng đăng nhập ở đây nè, tao điền password hộ mày luôn cho lẹ ráng chịu nha!"*. Và thế là chữ lại nhảy đầy chật cái form. 
Việc set `autoComplete="off"` ở thẻ HTML dạo gần đây bị các Trình duyệt... cố tình phớt lờ.
**Cách fix:** Dùng cú lừa "Mật khẩu mới". Trình duyệt sẽ không bao giờ dám tự điền mật khẩu cũ vào một cái lỗ mang danh là "Mật khẩu mới", vì nó sợ ghi đè dữ liệu.
Sửa file `src/app/login/page.tsx` ở ô Input Password:
```javascript
<input
    id="password"
    type="password"
    // ... các props khác
    autoComplete="new-password" // <-- Trick lừa Google Chrome
/>
<input
    id="email"
    type="email"
    // ... các props khác
    autoComplete="off" // Cố gắng chặn các trình duyệt hiền lành
/>
```

## Tổng kết
Cộng hưởng cả **3 phương pháp răn đe** trên: Flush NextJS Cache + Phân luồng Local/Session Storage + Lừa Google Password Manager, nay nút "Đăng xuất" của app AI Generator đã xịn ngang ngửa các ngân hàng lớn. App sẽ chẳng còn vương vấn một chữ cái nào của người dùng cũ sau khi bấm chốt!
