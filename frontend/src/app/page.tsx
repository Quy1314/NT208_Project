"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
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
  ChevronDown,
  X
} from "lucide-react";

interface Project {
  id: string;
  title: string;
  prompt: string;
  content: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false); // Ngăn chặn Double-Submit (Race Conditions)
  const [modelName, setModelName] = useState("Qwen/Qwen2.5-72B-Instruct");
  const [creativity, setCreativity] = useState("Balanced");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ id: string; email: string; created_at: string } | null>(null);

  const fetchUserProfile = async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
        setIsProfileOpen(true);
        setIsUserMenuOpen(false); 
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error("Failed to fetch user profile", e);
    }
  };

  const fetchProjects = async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

  useEffect(() => {
    // Auth check (Ưu tiên localStorage, nếu không có thì tìm trong sessionStorage)
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") {
      handleLogout(); // Nếu không có token nào, đá văng ra login
      return;
    }

    const email = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "User";
    setUserEmail(email);

    fetchProjects();

    // Handle click outside for dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  const handleSelectProject = async (id: string) => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data);
        setIsCreating(false);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering select project
    if (!confirm("Bạn có chắc muốn xoá dự án này không?")) return;
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (selectedProject?.id === id) setSelectedProject(null);
        fetchProjects();
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateProject = async () => {
    if (!prompt.trim()) {
      alert("Vui lòng nhập Prompt để AI tạo nội dung.");
      return;
    }

    // Tự động tạo Title từ Prompt nếu người dùng không nhập
    const finalTitle = title.trim() ? title : (prompt.trim().slice(0, 30) + (prompt.length > 30 ? "..." : ""));

    // Ngăn chặn race condition (click liên tục 2 lần)
    if (isGenerating) return;

    setIsGenerating(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: finalTitle, prompt })
      });
      if (res.ok) {
        const data = await res.json();
        setTitle("");
        setPrompt("");
        setIsCreating(false);
        setSelectedProject(data);
        fetchProjects();
      } else if (res.status === 401) {
        handleLogout();
      } else {
        alert("Có lỗi xảy ra khi tạo dự án.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false); // Reset cờ trạng thái
    }
  };

  function handleLogout() {
    // Quét dọn sạch sẽ tất cả session & local storage (trừ cái remembered_email)
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_email");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user_email");

    window.location.href = "/logout";
  }
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
            <span className="font-bold text-lg tracking-tight">AI Assistant</span>
          </div>

          {/* New Project Button */}
          <button
            onClick={() => { setIsCreating(true); setSelectedProject(null); setTitle(""); setPrompt(""); }}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-colors w-full p-2.5 rounded-xl text-sm font-semibold text-slate-700 shadow-sm mb-6">
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
                <div key={proj.id} className="group relative flex items-center w-full">
                  <button
                    onClick={() => handleSelectProject(proj.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${selectedProject?.id === proj.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}>
                    <MessageSquare size={16} className={selectedProject?.id === proj.id ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-500'} />
                    <span className="truncate flex-1 pr-6">{proj.title}</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteProject(proj.id, e)}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1">
                    <LogOut size={14} className="rotate-180" />
                  </button>
                </div>
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
                  <button
                    onClick={fetchUserProfile}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors">
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
          <main className="flex-1 overflow-y-auto px-4 pb-40">
            {selectedProject ? (
              <div className="max-w-3xl mx-auto pt-10 px-4">
                <h2 className="text-2xl font-bold text-slate-800 mb-6 px-4">{selectedProject.title}</h2>
                <div className="bg-blue-50 text-blue-900 p-4 rounded-xl mb-6 shadow-sm border border-blue-100 self-end ml-auto max-w-[85%]">
                  <p className="font-semibold text-xs text-blue-700 mb-1 uppercase tracking-wider">Your Prompt</p>
                  <p className="text-sm font-medium whitespace-pre-wrap">{selectedProject.prompt}</p>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-slate-700 mb-8 w-full max-w-[95%]">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white">
                      <Sparkles size={12} />
                    </div>
                    <span className="font-bold text-sm">AI Generated Content</span>
                  </div>
                  <div className="prose prose-sm max-w-none prose-slate">
                    {selectedProject.content === "Waiting for LLM generation..." ? (
                      <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-200"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-400"></div>
                        <span className="ml-2 text-sm">AI is writing your story...</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{selectedProject.content}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : isCreating ? (
              <div className="max-w-3xl mx-auto pt-10 px-4 h-full flex flex-col justify-center">
                <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">Create New Project</h2>
                <p className="text-slate-500 font-medium mb-10">Instruct the AI to generate a creative story below.</p>
                {/* Ẩn cục bộ form nhập Title gốc đi, vì giờ đã Auto-generate từ Prompt ở dưới */}
              </div>
            ) : (
              <div className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center pt-10 lg:pt-20">
                {/* Avatar & Greeting */}
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-blue-300 shadow-md mb-6"></div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Hi, there 👋
                </h2>
                <p className="text-slate-500 font-medium mb-12 text-center">
                  Select a project from the sidebar or create a new one to begin.
                </p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-sm transition-colors flex items-center gap-2">
                  <Plus size={18} /> Start Creative Project
                </button>
              </div>
            )}
          </main>

          { }
          {isCreating && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[95%] sm:w-[85%] max-w-4xl z-30">
              <div className="bg-[#1b1c20] border border-[#2a2c31] shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-3xl p-3 flex flex-col gap-2 transition-all">

                {/* Input Area */}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your story, characters, and plot here..."
                  className="w-full max-h-32 min-h-[60px] p-3 text-[#f3f4f6] focus:outline-none resize-none placeholder-[#6b7280] bg-transparent font-medium"
                />

                {/* Tools & Generate Button Bar */}
                <div className="flex items-center justify-between pt-1 px-2 border-t border-[#2a2c31]/50 mt-1">

                  <div className="flex items-center gap-2">
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="text-xs font-semibold text-[#d4d4d8] bg-[#2a2c31] border border-[#3f3f46] px-3 py-1.5 rounded-lg"
                    >
                      <option>Qwen/Qwen2.5-72B-Instruct</option>
                      <option>meta-llama/Llama-3.1-70B-Instruct</option>
                      <option>mistralai/Mixtral-8x7B-Instruct-v0.1</option>
                    </select>
                    <select
                      value={creativity}
                      onChange={(e) => setCreativity(e.target.value)}
                      className="text-xs font-semibold text-[#d4d4d8] bg-[#2a2c31] border border-[#3f3f46] px-3 py-1.5 rounded-lg"
                    >
                      <option>Focused</option>
                      <option>Balanced</option>
                      <option>Creative</option>
                    </select>
                  </div>

                  {/* Right: Original Tools & Generate */}
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 text-xs font-semibold text-[#a1a1aa] hover:text-white hover:bg-[#2a2c31] px-2 py-1.5 rounded-lg transition-colors">
                      <Paperclip size={14} /> Attach
                    </button>
                    <button className="flex items-center gap-1.5 text-xs font-semibold text-[#a1a1aa] hover:text-white hover:bg-[#2a2c31] px-2 py-1.5 rounded-lg transition-colors">
                      <Mic size={14} /> Voice
                    </button>

                    <button
                      onClick={handleCreateProject}
                      disabled={isGenerating}
                      className={`flex items-center gap-1.5 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all shadow-md ml-2 ${isGenerating ? 'bg-indigo-500/50 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 hover:shadow-lg'}`}>
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin"></div>
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} /> Generate
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-center mt-3 text-[10px] text-slate-400 font-medium font-sans">
                AI may display inaccurate info, so please double check the response.
              </div>
            </div>
          )}

          { }
          {isProfileOpen && (
            <>
              {/* Backdrop Overlay */}
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
                onClick={() => setIsProfileOpen(false)}
              ></div>

              {/* Sliding Dark Panel */}
              <div className="absolute top-0 right-0 w-full sm:w-[420px] h-full bg-[#1b1c20] shadow-[0_0_40px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center p-6 border-b border-transparent">
                  <button onClick={() => setIsProfileOpen(false)} className="text-[#8c8f99] hover:text-white transition-colors p-1 -ml-1">
                    <X size={20} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="px-8 flex-1 flex flex-col gap-6 overflow-y-auto pb-10">
                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">ID</label>
                    <div className="w-full bg-[#2a2c31] rounded-xl px-4 py-3.5 text-[14px] font-medium text-[#f3f4f6]">
                      {userProfile?.id}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Nickname</label>
                    <div className="w-full bg-[#2a2c31] rounded-xl px-4 py-3.5 text-[14px] font-medium text-[#f3f4f6]">
                      {userProfile?.email.split('@')[0]}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Email</label>
                    <div className="w-full bg-[#2a2c31] rounded-xl px-4 py-3.5 text-[14px] font-medium text-[#f3f4f6]">
                      {userProfile?.email}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Created At</label>
                    <div className="w-full bg-[#2a2c31] rounded-xl px-4 py-3.5 text-[14px] font-medium text-[#f3f4f6]">
                      {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleString('vi-VN') : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
