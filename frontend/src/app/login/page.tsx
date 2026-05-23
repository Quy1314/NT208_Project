"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/auth_shell";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [isDark, setIsDark] = useState(true);

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    // Auto fill email if Remember Me was checked previously
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

    // Handle form submission
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // OAuth2 standard parameters
            const formData = new URLSearchParams();
            formData.append("username", email);
            formData.append("password", password);
            formData.append("is_remember", rememberMe.toString());

            const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Login failed");
            }

            // Save tokens based on remember me checkbox preference
            if (rememberMe) {
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("user_email", email);
                localStorage.setItem("remembered_email", email);
            } else {
                sessionStorage.setItem("access_token", data.access_token);
                sessionStorage.setItem("user_email", email);
                localStorage.removeItem("remembered_email");
            }

            router.push("/workspace");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Chào mừng trở lại"
            subtitle="Đăng nhập để tiếp tục làm việc với AI Workspace"
            quote="Xây dựng, tinh chỉnh và xuất bản câu chuyện của bạn cùng AI."
            author="Đội ngũ AI Generator"
            role="Nền tảng sáng tạo"
        >
            <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
                {error && (
                    <div className={`rounded-xl border p-3.5 text-sm transition-all duration-200 animate-shake ${
                        isDark 
                            ? "border-red-500/30 bg-red-500/10 text-red-300" 
                            : "border-red-200 bg-red-50 text-red-700"
                    }`}>
                        {error}
                    </div>
                )}
                
                {/* Email input field */}
                <div className="space-y-2">
                    <label className={`block text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`} htmlFor="email">
                        Email
                    </label>
                    <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`h-11 px-4 py-3 text-sm rounded-xl transition-all duration-200 ${
                            isDark
                              ? "border-white/10 bg-slate-950/40 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                              : "border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                        }`}
                        placeholder="you@gmail.com"
                        autoComplete="off"
                    />
                </div>

                {/* Password input field */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className={`text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`} htmlFor="password">
                            Mật khẩu
                        </label>
                        <Link 
                            href="/forgot-password" 
                            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors duration-150"
                        >
                            Quên mật khẩu?
                        </Link>
                    </div>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`h-11 pl-4 pr-10 py-3 text-sm rounded-xl transition-all duration-200 ${
                                isDark
                                  ? "border-white/10 bg-slate-950/40 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                                  : "border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                            }`}
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                {/* Remember Me switch checkbox */}
                <label className="flex items-center gap-2.5 text-sm select-none cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-150">
                    <input 
                        id="remember-me" 
                        type="checkbox" 
                        checked={rememberMe} 
                        onChange={(e) => setRememberMe(e.target.checked)} 
                        className={`h-4 w-4 rounded transition-colors duration-150 ${
                            isDark 
                                ? "border-white/10 bg-slate-950/40 accent-blue-500" 
                                : "border-slate-200 bg-white accent-blue-600"
                        }`} 
                    />
                    Ghi nhớ đăng nhập
                </label>

                {/* Submit button with visual gradient */}
                <Button 
                    type="submit" 
                    disabled={loading}
                    className="h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                >
                    {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                </Button>
            </form>

            <p className={`mt-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Chưa có tài khoản?{" "}
                <Link 
                    href="/register" 
                    className="font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-150"
                >
                    Đăng ký
                </Link>
            </p>
        </AuthShell>
    );
}
