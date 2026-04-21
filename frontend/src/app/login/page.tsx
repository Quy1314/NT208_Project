"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { API_BASE_URL } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter(); // Dùng để chuyển hướng trang
    const [isDark, setIsDark] = useState(true);

    // State lưu trữ dữ liệu form
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false); // State lưu trạng thái checkbox

    // Tự động điền email nếu trước đó đã check Remember Me
    React.useEffect(() => {
        const savedEmail = localStorage.getItem("remembered_email");
        if (savedEmail) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "light") setIsDark(false);
        if (savedTheme === "dark") setIsDark(true);
    }, []);

    // Xử lý sự kiện đăng nhập
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // Chuyển Data sang định dạng Form-urlencoded để khớp chuẩn OAuth2 của FastAPI Swagger UI
            const formData = new URLSearchParams();
            formData.append("username", email); // Lưu ý: OAuth2 bắt buộc key phải tên là "username"
            formData.append("password", password);
            formData.append("is_remember", rememberMe.toString()); // Bắn luôn thông số này chọc xuống Database

            // Gửi HTTP POST request sang Backend API
            const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData,
            });

            // Chờ Backend phản hồi (parse sang Json) kết quả có chứa JWT Access Token
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Login failed");
            }

            // Lưu JWT Token dựa theo trạng thái Remember Me
            // Nếu có Remember Me -> Lưu localStorage (sống sót khi đóng tab)
            // Nếu không có -> Lưu sessionStorage (mất đi khi đóng tab)
            if (rememberMe) {
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("user_email", email);
                localStorage.setItem("remembered_email", email); // Lưu lại email để điền Form cho lần sau
            } else {
                sessionStorage.setItem("access_token", data.access_token);
                sessionStorage.setItem("user_email", email);
                localStorage.removeItem("remembered_email"); // Xóa email nếu không tick
            }

            // Chuyển hướng
            router.push("/");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Đăng nhập để tiếp tục làm việc với AI Workspace"
            quote="Build, iterate, and ship your stories with AI."
            author="AI Generator Team"
            role="Creative Platform"
        >
            <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
                {error && <div className={`rounded-lg border p-3 text-sm ${isDark ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
                <div>
                    <label className={`mb-1.5 block text-xs uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="email">Email</label>
                    <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        className={`w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none ${
                            isDark
                              ? "border-slate-700 bg-slate-950 text-white placeholder-slate-500"
                              : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
                        }`}
                        placeholder="you@gmail.com" autoComplete="off" />
                </div>
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className={`text-xs uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="password">Password</label>
                        <Link href="/forgot-password" className="text-xs text-blue-400 hover:text-blue-300">Forgot password?</Link>
                    </div>
                    <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                        className={`w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none ${
                            isDark
                              ? "border-slate-700 bg-slate-950 text-white placeholder-slate-500"
                              : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
                        }`}
                        placeholder="••••••••" autoComplete="new-password" />
                </div>
                <label className={`flex items-center gap-2 text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <input id="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className={`h-4 w-4 rounded ${isDark ? "border-slate-600 bg-slate-900" : "border-slate-300 bg-white"}`} />
                    Remember me
                </label>
                <button type="submit" disabled={loading}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">
                    {loading ? "Logging in..." : "Log in"}
                </button>
            </form>
            <p className={`mt-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Chưa có tài khoản? <Link href="/register" className="font-semibold text-blue-400 hover:text-blue-300">Đăng ký</Link>
            </p>
        </AuthShell>
    );
}
