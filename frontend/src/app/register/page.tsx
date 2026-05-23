"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/auth_shell";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
    const router = useRouter();
    const [isDark, setIsDark] = useState(true);

    // Local form states
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [isCheckingUser, setIsCheckingUser] = useState(false);
    const [userExists, setUserExists] = useState<boolean | null>(null);

    // Sync theme
    useEffect(() => {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "light") setIsDark(false);
        if (savedTheme === "dark") setIsDark(true);
    }, []);

    // Check if email already exists on debounce
    useEffect(() => {
        if (!email.trim() || !email.includes("@")) {
            setUserExists(null);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setIsCheckingUser(true);
                const res = await fetch(`${API_BASE_URL}/api/auth/check-user?email=${encodeURIComponent(email)}`);
                const data = await res.json();
                if (res.ok) {
                    setUserExists(Boolean(data.exists));
                }
            } catch {
                setUserExists(null);
            } finally {
                setIsCheckingUser(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [email]);

    // Handle signup form submit
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        if (userExists) {
            setError("Email này đã được đăng ký.");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Registration failed");
            }

            router.push("/login");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Registration failed");
        } finally {
            setLoading(false);
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
            <form onSubmit={handleRegister} className="space-y-6" autoComplete="off">
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
                    {isCheckingUser && (
                        <p className={`text-xs animate-pulse ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Đang kiểm tra tài khoản...
                        </p>
                    )}
                    {!isCheckingUser && userExists === true && (
                        <p className="text-xs text-red-400 font-medium">Email đã được đăng ký trước đó.</p>
                    )}
                    {!isCheckingUser && userExists === false && email.includes("@") && (
                        <p className="text-xs text-emerald-400 font-medium">Email khả dụng để sử dụng.</p>
                    )}
                </div>

                {/* Password input field */}
                <div className="space-y-2">
                    <label className={`block text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`} htmlFor="password">
                        Mật khẩu
                    </label>
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
                            placeholder="Tối thiểu 8 ký tự"
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

                {/* Submit Sign-up Button */}
                <Button 
                    type="submit" 
                    disabled={loading}
                    className="h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                >
                    {loading ? "Creating account..." : "Sign up"}
                </Button>
            </form>

            <p className={`mt-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Đã có tài khoản?{" "}
                <Link 
                    href="/login" 
                    className="font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-150"
                >
                    Đăng nhập
                </Link>
            </p>
        </AuthShell>
    );
}
