"use client";

import AuthShell from "@/components/auth/auth_shell";
import { API_BASE_URL } from "@/lib/api";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <form onSubmit={onSubmit} className="space-y-5">
        {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-slate-400" htmlFor="email">Email</label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-11 border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500"
            placeholder="you@gmail.com" />
        </div>
        <Button type="submit" disabled={loading}
          className="h-11 w-full bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500">
          {loading ? "Sending..." : "Send reset email"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        Nhớ mật khẩu rồi? <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300">Quay lại đăng nhập</Link>
      </p>
    </AuthShell>
  );
}
