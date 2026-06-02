"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileDown, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api";

type Project = {
  id: string;
  title: string;
  prompt: string;
  content: string;
};

type ProjectStageProps = {
  isDark: boolean;
  selectedProject: Project | null;
  isCreating: boolean;
  exportingFormat: null | "md" | "pdf" | "docx";
  onOpenExport: () => void;
  onDeleteSelectedProject: () => void;
  onStartCreating: () => void;
  isStreaming?: boolean;
  draftTitle?: string;
  onSetDraftTitle?: (v: string) => void;
  onAutoGenerateTitle?: () => void;
  isGeneratingTitle?: boolean;
};

interface TypewriterTextProps {
  text: string;
  isStreaming: boolean;
}

function TypewriterText({ text, isStreaming }: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const textRef = useRef(text);
  const indexRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle typing effect when streaming is active
  useEffect(() => {
    if (!isStreaming) return;

    textRef.current = text;

    // Start a timer to append characters if we are behind text
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        const currentTarget = textRef.current;
        const remaining = currentTarget.length - indexRef.current;
        if (remaining > 0) {
          // If we are lagging far behind (e.g. > 100 chars), type faster
          const speed = remaining > 100 ? 6 : remaining > 30 ? 3 : 2;
          const charsToType = Math.min(speed, remaining);
          indexRef.current += charsToType;
          setDisplayedText(currentTarget.slice(0, indexRef.current));
        }
      }, 15); // every 15ms
    }
  }, [text, isStreaming]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return <>{isStreaming ? displayedText : text}</>;
}

function renderGeneratedContent(content: string, isDark: boolean, isStreaming: boolean = false) {
  if (!content || content === "Waiting for LLM generation...") {
    return (
      <div className="flex items-center gap-2 text-slate-400 animate-pulse">
        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-200"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-400"></div>
        <span className="ml-2 text-sm">AI đang viết nội dung cho bạn...</span>
      </div>
    );
  }

  const segments = content.split(/\n\n---\n\n/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const isStreamingSegment = isLast && isStreaming;

        if (seg.startsWith("data:image/")) {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- HF trả về data URL inline
            <img
              key={i}
              src={seg}
              alt=""
              className={`max-h-[min(85vh,920px)] w-auto max-w-full rounded-xl border object-contain shadow-lg ${
                isDark ? "border-white/10" : "border-slate-200"
              }`}
            />
          );
        }
        if (seg.startsWith("/uploads/audio/")) {
          return (
            <audio
              key={i}
              src={`${API_BASE_URL}${seg}`}
              controls
              className="w-full max-w-md mt-4 shadow-sm"
            />
          );
        }
        if (seg.startsWith("[[USER_PROMPT]]")) {
          const promptText = seg.replace(/^\[\[USER_PROMPT\]\]\s*/, "").trim();
          return (
            <div
              key={i}
              className={`p-4 rounded-xl shadow-sm border self-end ml-auto max-w-[85%] transition-all duration-300 ${
                isDark ? "bg-slate-900/60 backdrop-blur-xl border-white/10 text-white shadow-black/25" : "bg-blue-50 text-blue-900 border-blue-100"
              }`}
            >
              <p className={`font-semibold text-xs mb-1 uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-700"}`}>Yêu cầu của bạn</p>
              <p className="text-sm font-medium whitespace-pre-wrap">{promptText}</p>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={`p-6 rounded-2xl shadow-sm border w-full max-w-[95%] transition-all duration-300 ${
              isDark ? "bg-slate-900/40 backdrop-blur-xl border-white/10 text-white shadow-black/25" : "bg-white border-slate-100 text-slate-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                <Sparkles size={12} />
              </div>
              <span className="font-bold text-sm">Nội dung AI đã tạo</span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">
              {isStreamingSegment ? (
                <TypewriterText text={seg} isStreaming={isStreaming} />
              ) : (
                seg
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function ProjectStage({
  isDark,
  selectedProject,
  isCreating,
  exportingFormat,
  onOpenExport,
  onDeleteSelectedProject,
  onStartCreating,
  isStreaming = false,
  draftTitle = "",
  onSetDraftTitle,
  onAutoGenerateTitle,
  isGeneratingTitle = false,
}: ProjectStageProps) {
  if (selectedProject) {
    return (
      <div className="max-w-3xl mx-auto pt-10 px-4">
        <div className="mb-6 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={`text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{selectedProject.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {selectedProject.content?.trim() && selectedProject.content !== "Waiting for LLM generation..." && (
              <Button
                type="button"
                onClick={onOpenExport}
                disabled={exportingFormat !== null}
                variant="outline"
                size="sm"
                className={`transition-all ${isDark ? "border-white/10 bg-slate-950/40 text-slate-200 hover:bg-slate-800/60" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                <FileDown size={14} />
                {exportingFormat ? "Đang xuất..." : "Xuất file"}
              </Button>
            )}
            <Button
              onClick={onDeleteSelectedProject}
              variant="destructive"
              size="sm"
              className={`transition-all ${isDark ? "border-red-500/20 bg-red-950/40 text-red-300 hover:bg-red-950/60" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}
            >
              Xóa dự án
            </Button>
          </div>
        </div>

        <div className={`p-4 rounded-xl mb-6 shadow-sm border self-end ml-auto max-w-[85%] transition-all duration-300 ${
          isDark ? "bg-slate-900/60 backdrop-blur-xl border-white/10 text-white shadow-black/25" : "bg-blue-50 text-blue-900 border-blue-100"
        }`}>
          <p className={`font-semibold text-xs mb-1 uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-700"}`}>Yêu cầu của bạn</p>
          <p className="text-sm font-medium whitespace-pre-wrap">{selectedProject.prompt}</p>
        </div>

        <div className="mb-8 space-y-4">
          {renderGeneratedContent(selectedProject.content, isDark, isStreaming)}
        </div>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="max-w-3xl mx-auto pt-10 px-4 h-full flex flex-col justify-center animate-in fade-in duration-300">
        <h2 className={`text-3xl md:text-4xl font-extrabold mb-2 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>Tạo dự án mới</h2>
        <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-8`}>Hãy hướng dẫn AI tạo một câu chuyện sáng tạo bên dưới.</p>
        
        <div className={`p-6 rounded-3xl border mb-10 transition-all shadow-md ${
          isDark 
            ? "bg-slate-900/40 backdrop-blur-xl border-white/10 text-white shadow-black/25" 
            : "bg-slate-50 border-slate-200 shadow-slate-100/50"
        }`}>
          <label className={`block text-xs font-bold uppercase tracking-wider mb-2.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Tiêu đề dự án
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Nhập tiêu đề hoặc để AI tự đặt tên..."
              value={draftTitle}
              onChange={(e) => onSetDraftTitle?.(e.target.value)}
              className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                isDark
                  ? "bg-slate-950/60 border-white/10 text-white placeholder-slate-500 focus:border-cyan-500/40"
                  : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-300"
              }`}
            />
            {onAutoGenerateTitle && (
              <Button
                type="button"
                onClick={onAutoGenerateTitle}
                disabled={isGeneratingTitle}
                className={`text-xs font-bold px-5 py-3 rounded-2xl flex items-center gap-2 border transition-all cursor-pointer ${
                  isDark
                    ? "bg-slate-950/40 border-white/10 text-white hover:bg-slate-900/60 hover:text-cyan-300"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                }`}
              >
                <Sparkles size={14} className={isGeneratingTitle ? "animate-spin text-cyan-400" : "text-cyan-400"} />
                {isGeneratingTitle ? "Đang đặt..." : "Tự đặt tên"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center pt-10 lg:pt-20">
      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md mb-6 flex items-center justify-center text-white">
        <Sparkles size={24} />
      </div>
      <h2 className={`text-3xl md:text-4xl font-extrabold mb-3 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
        Xin chào
      </h2>
      <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-12 text-center`}>
        Chọn một dự án từ thanh bên hoặc tạo dự án mới để bắt đầu.
      </p>
      <Button 
        onClick={onStartCreating} 
        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-blue-600/10 transition-all flex items-center gap-2 cursor-pointer"
      >
        <Plus size={18} /> Bắt đầu dự án sáng tạo
      </Button>
    </div>
  );
}
