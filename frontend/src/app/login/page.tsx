"use client"; // Client Component để xử lý State và Form

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter(); // Dùng để chuyển hướng trang

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

            // Gửi HTTP POST request sang Backend API
            const res = await fetch("http://127.0.0.1:8000/api/auth/login", {
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
                localStorage.setItem("remembered_email", email);
            } else {
                sessionStorage.setItem("access_token", data.access_token);
                sessionStorage.setItem("user_email", email);
                localStorage.removeItem("remembered_email");
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
        <div className="flex min-h-screen bg-white">
            {/* LEFT SIDE - 30% Secondary Color Area (Image + Overlay) - Giữ đồng bộ 100% với Register */}
            <div className="hidden lg:flex lg:w-5/12 relative bg-blue-900 text-white flex-col justify-between overflow-hidden p-12">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-800 to-slate-900 z-0 opacity-90"></div>
                {/* Pattern overlay */}
                <div
                    className="absolute inset-0 z-0 mix-blend-overlay opacity-30"
                    style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                ></div>

                <div className="relative z-10 font-bold text-2xl tracking-tight">
                    <span className="text-blue-400">AI</span> Generator
                </div>

                <div className="relative z-10 mb-8">
                    <blockquote className="text-3xl font-bold leading-tight mb-6">
                        "Welcome back! Let's continue building great content together."
                    </blockquote>
                    <div className="text-sm">
                        <div className="font-semibold text-white">System Admin</div>
                        <div className="text-slate-300">AI Generator Platform</div>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE - 60% Primary Area (Form) + 10% Accent (Buttons) */}
            <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 md:px-24 lg:px-32 xl:px-48 relative">
                <div className="w-full max-w-md mx-auto">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Welcome back</h1>
                        <p className="text-slate-500 font-medium">Log in to your account to continue creating.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium border border-red-100">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors placeholder-slate-400 text-slate-900 font-medium bg-slate-50"
                                placeholder="alex.jordan@gmail.com"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest" htmlFor="password">
                                    Password
                                </label>
                                <Link href="#" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors placeholder-slate-400 text-slate-900 font-medium bg-slate-50"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Remember Me Checkbox */}
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setRememberMe(isChecked);
                                    if (!isChecked) {
                                        // Xóa ngay lập tức nếu người dùng bỏ check (tránh login ảo)
                                        localStorage.removeItem("remembered_email");
                                    }
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-pointer"
                            />
                            <label htmlFor="remember-me" className="ml-2 block text-sm font-medium text-slate-700 cursor-pointer">
                                Remember me
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? "Logging in..." : "Log in"}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm font-medium text-slate-500">
                        Don't have an account?{" "}
                        <Link href="/register" className="text-blue-600 hover:text-blue-700 font-bold transition-colors">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
