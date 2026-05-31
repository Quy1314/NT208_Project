"use client";

import React from "react";
import { Moon, Sun, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  // Sync with local storage theme
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

  // Mouse tracking logic for premium gravity parallax and ambient glow
  React.useEffect(() => {
    const root = document.documentElement;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { ...target };
    let rafId = 0;

    const animate = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;

      root.style.setProperty("--gravity-x", `${current.x}px`);
      root.style.setProperty("--gravity-y", `${current.y}px`);
      root.style.setProperty("--gravity-x-ratio", `${current.x / window.innerWidth}`);
      root.style.setProperty("--gravity-y-ratio", `${current.y / window.innerHeight}`);

      rafId = requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${isDark ? "dark bg-[#040812] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {/* Left Panel - Premium Brand Intro */}
      <aside className="relative hidden w-5/12 overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        {/* Background gradient mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(29,78,216,0.3),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(124,58,237,0.25),transparent_45%),linear-gradient(135deg,#020617,#0f172a)]" />
        
        {/* Slow drifting animated glow points */}
        <div className="absolute top-[20%] left-[30%] h-72 w-72 rounded-full bg-blue-500/10 blur-[80px] animate-pulse duration-[8000ms]" />
        <div className="absolute bottom-[20%] right-[20%] h-80 w-80 rounded-full bg-purple-500/10 blur-[90px] animate-pulse duration-[10000ms]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full">


          {/* Header Brand */}
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tight select-none">
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">own your AI</span>
          </div>

          {/* Middle Quote */}
          <div className="space-y-6 max-w-lg">
            <blockquote className="text-3xl font-extrabold leading-tight text-white drop-shadow-sm">
              &ldquo;{quote}&rdquo;
            </blockquote>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-300">{author}</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-blue-300">
                {role}
              </span>
            </div>
          </div>

          {/* Bottom Branding Icon */}
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-[0_4px_12px_rgba(37,99,235,0.3)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Premium Workspace</span>
          </div>
        </div>
      </aside>

      {/* Right Panel - Login Card */}
      <main className="gravity-surface flex-1 flex items-center justify-center px-6 py-10 sm:px-12 relative overflow-hidden">
        {/* Background glow follower is enabled via gravity-surface container */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_120%,rgba(37,99,235,0.06),transparent_50%)]" />
        
        {/* Card wrapper with interactive 3D rotation */}
        <div className="gravity-card w-full max-w-md z-10">
          <Card
            className={`relative p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
              isDark
                ? "border-white/10 bg-slate-900/40 text-white shadow-black/45"
                : "border-slate-200/80 bg-white/80 text-slate-900 shadow-slate-200/50"
            }`}
          >
            {/* Theme Toggle Button */}
            <Button
              type="button"
              onClick={toggleTheme}
              variant="outline"
              size="icon-sm"
              className={`absolute right-4 top-4 rounded-xl transition-all duration-200 ${
                isDark
                  ? "bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 border-white/10"
                  : "bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 border-slate-200"
              }`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <CardHeader className="pt-6 text-center">
              <CardTitle className={`text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {title}
              </CardTitle>
              <CardDescription className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {subtitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">{children}</CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
