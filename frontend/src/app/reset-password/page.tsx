"use client";

import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/auth_shell";
import { API_BASE_URL } from "@/lib/api";
import { toResetPasswordApiPayload } from "@/lib/api_adapters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Sync theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") setIsDark(false);
    if (savedTheme === "dark") setIsDark(true);
  }, []);

  // Capture token from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toResetPasswordApiPayload({ token, newPassword })),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Có lỗi xảy ra.");
      setMessage(data.message);
      setNewPassword("");
      setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="Đặt mật khẩu mới để tiếp tục truy cập workspace"
      quote="Fast recovery, secure by default."
      author="AI Generator Team"
      role="Platform Security"
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {message && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-300 animate-fade-in">
            {message}
          </div>
        )}
        {error && (
          <div className={`rounded-xl border p-3.5 text-sm animate-shake ${
            isDark 
              ? "border-red-500/30 bg-red-500/10 text-red-300" 
              : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {error}
          </div>
        )}

        {/* New Password input field */}
        <div className="space-y-2">
          <label className={`block text-xs font-semibold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`} htmlFor="password">
            Mật khẩu mới
          </label>
          <div className="relative">
            <Input 
              id="password" 
              type={showPassword ? "text" : "password"} 
              required 
              minLength={8} 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)}
              className={`h-11 pl-4 pr-10 py-3 text-sm rounded-xl transition-all duration-200 ${
                isDark
                  ? "border-white/10 bg-slate-950/40 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                  : "border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
              }`}
              placeholder="Tối thiểu 8 ký tự" 
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

        {/* Submit Update Password Button */}
        <Button 
          type="submit" 
          disabled={loading || !token}
          className="h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
      
      <p className={`mt-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        <Link 
          href="/login" 
          className="font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-150"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthShell>
  );
}
