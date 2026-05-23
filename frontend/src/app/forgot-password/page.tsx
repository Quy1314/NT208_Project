"use client";

import React, { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/auth_shell";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Có lỗi xảy ra.");
      setMessage(data.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Nhập email để nhận link reset mật khẩu"
      quote="Security and creativity should work together."
      author="AI Generator Team"
      role="Platform Security"
    >
      <form onSubmit={onSubmit} className="space-y-6" autoComplete="off">
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
          />
        </div>

        {/* Submit Reset Button */}
        <Button 
          type="submit" 
          disabled={loading}
          className="h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          {loading ? "Sending..." : "Send reset email"}
        </Button>
      </form>

      <p className={`mt-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        Nhớ mật khẩu rồi?{" "}
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
