"use client";

import AuthShell from "@/components/auth/AuthShell";
import { API_BASE_URL } from "@/lib/api";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Có lỗi xảy ra.");
      setMessage(data.message);
      setNewPassword("");
    } catch (err: any) {
      setError(err.message);
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
      <form onSubmit={onSubmit} className="space-y-5">
        {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-slate-400" htmlFor="password">New password</label>
          <input id="password" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder="Tối thiểu 8 ký tự" />
        </div>
        <button type="submit" disabled={loading || !token}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300">Quay lại đăng nhập</Link>
      </p>
    </AuthShell>
  );
}
