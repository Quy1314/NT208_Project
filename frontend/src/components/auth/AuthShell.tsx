"use client";

import React from "react";

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
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden lg:flex lg:w-5/12 relative overflow-hidden p-12 border-r border-slate-800">
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
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl backdrop-blur">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white">{title}</h1>
            <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
          </header>
          {children}
        </section>
      </main>
    </div>
  );
}
