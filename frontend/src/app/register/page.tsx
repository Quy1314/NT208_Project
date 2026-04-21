"use client"; // Lệnh này báo cho Next.js biết đây là một Client Component (chạy trên trình duyệt, có State và Effect)

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { API_BASE_URL } from "@/lib/api";

export default function RegisterPage() {
    const router = useRouter(); // Dùng để chuyển hướng trang bằng code (redirect)

    // Khởi tạo các State cục bộ để lưu trữ dữ liệu form và trạng thái
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Hàm sự kiện chạy khi người dùng bấm nút Submit
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault(); // Chặn hành vi load lại trang mặc định của thẻ <form> HTML
        setLoading(true); // Bật hiệu ứng loading để ngăn người dùng bấm nhiều lần
        setError(""); // Xóa lỗi cũ nếu có

        try {
            // Gửi HTTP POST request sang Backend API
            const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }), // Gói email/pass vào JSON
            });

            // Chờ Backend phản hồi (parse sang Json)
            const data = await res.json();

            // res.ok = true nếu HTTP status từ 200 -> 299, ngược lại nếu 400, 401, 500 thì nhảy vào if này
            if (!res.ok) {
                // Quăng lỗi ra ngoài block catch để hiển thị lên màn hình (ưu tiên lấy 'detail' gửi từ backend)
                throw new Error(data.detail || "Registration failed");
            }

            // Nếu API đăng ký thành công, lập tức chuyển hướng sang trang /login
            router.push("/login");
        } catch (err: any) {
            // Bắt và lưu lại báo lỗi từ backend để hiện ra trên UI
            setError(err.message);
        } finally {
            setLoading(false); // Dù lỗi hay ko thì cũng mở khóa nút lại
        }
    };

    return (
        <AuthShell
            title="Create account"
            subtitle="Bắt đầu workspace sáng tạo nội dung của bạn"
            quote="Create once, iterate forever with contextual AI."
            author="AI Generator Team"
            role="Creative Platform"
        >
            <form onSubmit={handleRegister} className="space-y-5">
                {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
                <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-wider text-slate-400" htmlFor="email">Email</label>
                    <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        placeholder="you@gmail.com" />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-wider text-slate-400" htmlFor="password">Password</label>
                    <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        placeholder="Tối thiểu 8 ký tự" />
                </div>
                <button type="submit" disabled={loading}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">
                    {loading ? "Creating account..." : "Sign up"}
                </button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-400">
                Đã có tài khoản? <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300">Đăng nhập</Link>
            </p>
        </AuthShell>
    );
}
