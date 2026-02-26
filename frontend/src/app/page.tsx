"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Settings,
  LogOut,
  User,
  Plus,
  MoreHorizontal,
  Paperclip,
  Mic,
  ArrowUp,
  LayoutDashboard,
  Sparkles,
  ChevronDown
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [prompt, setPrompt] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Mock projects for UI
  const projects = [
    { id: "1", title: "Kịch bản Tiktok Nấu ăn" },
    { id: "2", title: "Cốt truyện Sci-fi ngắn" },
    { id: "3", title: "Ý tưởng Video Marketing" },
  ];

  useEffect(() => {
    // Auth check (Ưu tiên localStorage, nếu không có thì tìm trong sessionStorage)
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) {
      router.push("/login"); // Nếu không có token nào, đá văng ra login
      return;
    }

    const email = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "User";
    setUserEmail(email);

    // Handle click outside for dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  const handleLogout = () => {
    // Quét dọn sạch sẽ tất cả session & local storage (trừ cái remembered_email)
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_email");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user_email");

    // Dùng window.location.href thay vì router.push để XÓA SẠCH CACHE của NextJS Router
    // Điều này đảm bảo trang /login được load mới hoàn toàn, input form không bị dính chữ cũ
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen bg-slate-100 p-2 sm:p-4 font-sans text-slate-900">
      {/* MAIN APP CONTAINER */}
      <div className="flex w-full h-full bg-white rounded-[2rem] overflow-hidden shadow-sm border border-slate-200">

        {/* 1. LEFT SIDEBAR (Projects) */}
        <div className="w-64 bg-slate-50 border-r border-slate-100 flex flex-col pt-6 pb-4 px-4 hidden md:flex">
          {/* Logo Area */}
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </div>
            <span className="font-bold text-lg tracking-tight">AI Generator</span>
          </div>

          {/* New Project Button */}
          <button className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-colors w-full p-2.5 rounded-xl text-sm font-semibold text-slate-700 shadow-sm mb-6">
            <Plus size={18} />
            New Project
          </button>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">
              Recent Projects
            </div>
            <div className="space-y-1">
              {projects.map((proj) => (
                <button key={proj.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg text-sm text-slate-700 font-medium transition-colors text-left group">
                  <MessageSquare size={16} className="text-slate-400 group-hover:text-blue-500" />
                  <span className="truncate flex-1">{proj.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Sidebar Settings */}
          <div className="mt-auto pt-4 border-t border-slate-200/60">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg text-sm text-slate-700 font-medium transition-colors">
              <Settings size={18} className="text-slate-400" />
              Settings
            </button>
          </div>
        </div>

        {/* 2. MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col relative bg-white">

          {/* TOP HEADER (User Dropdown) */}
          <header className="flex justify-between items-center p-5 lg:px-8">
            <div className="md:hidden flex items-center gap-2 font-bold">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
                <Sparkles size={12} />
              </div>
              AI Generator
            </div>
            <div className="hidden md:flex items-center gap-4">
              {/* Breadcrumbs / Top Actions can go here */}
              <span className="text-sm font-semibold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-full">Test  GPT Plus</span>
            </div>

            {/* User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 hover:bg-slate-50 p-1.5 pr-3 rounded-full border border-slate-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center uppercase">
                  {userEmail ? userEmail.charAt(0) : "U"}
                </div>
                <span className="text-sm font-semibold text-slate-700 hidden sm:block max-w-[120px] truncate">
                  {userEmail}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {/* Dropdown Panel */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-slate-100 mb-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Signed in as</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{userEmail}</p>
                  </div>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                    <User size={16} />
                    User Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-slate-50"
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* CENTER STAGE (Greeting & Cards) */}
          <main className="flex-1 overflow-y-auto px-4 pb-32">
            <div className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center pt-10 lg:pt-20">

              {/* Avatar & Greeting */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-blue-300 shadow-md mb-6"></div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                Hi, there 👋
              </h2>
              <p className="text-slate-500 font-medium mb-12 text-center">
                Tell us what you need, and we'll handle the rest.
              </p>

              {/* Suggestion Cards Container */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-10">
                {/* Card 1: Dark Mode */}
                <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm transform transition-transform hover:-translate-y-1 cursor-pointer">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold">S</div>
                      <span className="text-xs font-semibold text-slate-300">Sam Lee</span>
                    </div>
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-md">Data Assistant</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    Designed to help manage sales processes and maximize customer engagement.
                  </p>
                </div>

                {/* Card 2: Checklist */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transform transition-transform hover:-translate-y-1 cursor-pointer flex flex-col">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-start gap-2 text-xs font-medium text-slate-700">
                      <div className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 mt-0.5"></div>
                      Answer RFP documentation
                    </div>
                    <div className="flex items-start gap-2 text-xs font-medium text-slate-700">
                      <div className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 mt-0.5"></div>
                      Conduct a competitor analysis
                    </div>
                    <div className="flex items-start gap-2 text-xs font-medium text-slate-700">
                      <div className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 mt-0.5"></div>
                      Provide feedback on communication
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-50 text-[10px] font-semibold text-slate-400">
                    <span>Tasks</span>
                    <span className="text-blue-500 cursor-pointer hover:underline">View All</span>
                  </div>
                </div>

                {/* Card 3: Suggested Prompt */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transform transition-transform hover:-translate-y-1 cursor-pointer flex flex-col">
                  <div className="flex justify-end mb-2">
                    <MoreHorizontal size={16} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 leading-relaxed flex-1">
                    What are the key benefits of Product 1 that I should highlight to potential clients?
                  </p>
                  <div className="mt-4 text-[10px] font-semibold text-slate-400">
                    Suggested prompt
                  </div>
                </div>
              </div>

              {/* Pill Tags */}
              <div className="flex flex-wrap justify-center gap-3">
                <button className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-full shadow-sm transition-all">
                  <span className="text-red-400">📅</span> Connect Calendar
                </button>
                <button className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-full shadow-sm transition-all">
                  <span className="text-blue-400">🎯</span> Demo Task
                </button>
                <button className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-full shadow-sm transition-all">
                  <span className="text-orange-400">🧩</span> Browse Integrations
                </button>
                <button className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-full shadow-sm transition-all">
                  <span className="text-emerald-400">📝</span> Shared in Notes
                </button>
              </div>
            </div>
          </main>

          {/* BOTTOM PROMPT INPUT */}
          <div className="absolute bottom-0 left-0 w-full p-4 lg:p-8 bg-gradient-to-t from-white via-white to-transparent">
            <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask me anything..."
                className="w-full max-h-32 min-h-[60px] p-3 text-slate-800 focus:outline-none resize-none placeholder-slate-400 bg-transparent font-medium"
              />
              <div className="flex items-center justify-between pt-2 px-2 pb-1 border-t border-slate-50">
                <button className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                  Select Source <ChevronDown size={14} />
                </button>

                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1.5 transition-colors">
                    <Paperclip size={14} /> Attach
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1.5 transition-colors">
                    <Mic size={14} /> Voice
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 px-4 py-2 rounded-xl transition-all shadow-sm ml-2">
                    <ArrowUp size={16} /> Send
                  </button>
                </div>
              </div>
            </div>
            <div className="text-center mt-3 text-[10px] text-slate-400 font-medium">
              AI may display inaccurate info, so please double check the response. <span className="underline cursor-pointer">Your Privacy & Policy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
