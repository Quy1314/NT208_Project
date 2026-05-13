"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
              <Badge variant="secondary" className="mt-2 bg-white/10 text-slate-200 ring-1 ring-white/20">
                {role}
              </Badge>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex items-center justify-center px-6 py-10 sm:px-12">
        <Card
          className={`relative w-full max-w-md p-3 shadow-2xl backdrop-blur ${
            isDark
              ? "border-slate-800 bg-slate-900/80"
              : "border-slate-200 bg-white"
          }`}
        >
          <Button
            type="button"
            onClick={toggleTheme}
            variant="outline"
            size="icon-sm"
            className={`absolute right-4 top-4 ${
              isDark ? "bg-slate-800 text-slate-100 hover:bg-slate-700 border-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
            }`}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <CardHeader className="pt-6 text-center">
            <CardTitle className={`text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{title}</CardTitle>
            <CardDescription className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>{subtitle}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
