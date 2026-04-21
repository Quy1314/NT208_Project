"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  quote: string;
  author: string;
  role: string;
  children: React.ReactNode;
};

export default function AuthShell({
  title,
  subtitle,
  quote,
  author,
  role,
  children,
}: AuthShellProps) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsDark(false);
      return;
    }
    if (savedTheme === "dark") {
      setIsDark(true);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(prefersDark);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <div className={`flex min-h-screen ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}>
      <aside className={`hidden lg:flex lg:w-5/12 relative overflow-hidden p-12 ${isDark ? "border-r border-slate-800" : "border-r border-slate-200 bg-white"}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#1d4ed880,transparent_40%),radial-gradient(circle_at_80%_75%,#7c3aed60,transparent_45%),linear-gradient(120deg,#020617,#0f172a)]" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-blue-400">AI</span> Generator
          </div>
          <div className="space-y-6">
            <blockquote className="text-3xl font-bold leading-tight">{quote}</blockquote>
            <div className="text-sm text-slate-300">
              <p className="font-semibold text-white">{author}</p>
              <p>{role}</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex items-center justify-center px-6 py-10 sm:px-12">
        <section className={`relative w-full max-w-md rounded-2xl p-7 shadow-2xl backdrop-blur ${
          isDark
            ? "border border-slate-800 bg-slate-900/80"
            : "border border-slate-200 bg-white"
        }`}>
          <button
            type="button"
            onClick={toggleTheme}
            className={`absolute right-4 top-4 rounded-lg p-2 transition-colors ${
              isDark ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <header className="mb-8 text-center">
            <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{title}</h1>
            <p className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>{subtitle}</p>
          </header>
          {children}
        </section>
      </main>
    </div>
  );
}
