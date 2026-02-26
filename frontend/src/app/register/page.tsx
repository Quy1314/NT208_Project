"use client"; // Lệnh này báo cho Next.js biết đây là một Client Component (chạy trên trình duyệt, có State và Effect)

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
            const res = await fetch("http://127.0.0.1:8000/api/auth/register", {
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
        <div className="flex min-h-screen bg-white">
            {/* LEFT SIDE - 30% Secondary Color Area (Image + Overlay) */}
            <div className="hidden lg:flex lg:w-5/12 relative bg-blue-900 text-white flex-col justify-between overflow-hidden p-12">
                {/* Placeholder gradient to simulate an epic image */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-800 to-slate-900 z-0 opacity-90"></div>
                <div
                    className="absolute inset-0 z-0 mix-blend-overlay opacity-30"
                    style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                ></div>

                <div className="relative z-10 font-bold text-2xl tracking-tight">
                    <span className="text-blue-400">AI</span> Generator
                </div>

                <div className="relative z-10 mb-8">
                    <blockquote className="text-3xl font-bold leading-tight mb-6">
                        "All the creative tools my imagination needs to build great content."
                    </blockquote>
                    <div className="text-sm">
                        <div className="font-semibold text-white">Karen Yue</div>
                        <div className="text-slate-300">Director of Content Creation</div>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE - 60% Primary Area (Form) + 10% Accent (Buttons) */}
            <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 md:px-24 lg:px-32 xl:px-48 relative">
                <div className="w-full max-w-md mx-auto">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Create an account</h1>
                        <p className="text-slate-500 font-medium">Build your content effortlessly with our powerful AI generation tools.</p>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-6">
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
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2" htmlFor="password">
                                Password
                            </label>
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

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                            {loading ? "Creating account..." : "Sign up"}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm font-medium text-slate-500">
                        Already have an account?{" "}
                        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-bold transition-colors">
                            Log in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
