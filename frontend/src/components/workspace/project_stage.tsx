"use client";

import { FileDown, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

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
};

function renderGeneratedContent(content: string, isDark: boolean) {
  if (!content || content === "Waiting for LLM generation...") {
    return (
      <div className="flex items-center gap-2 text-slate-400 animate-pulse">
        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-200"></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-400"></div>
        <span className="ml-2 text-sm">AI is writing your story...</span>
      </div>
    );
  }

  const segments = content.split(/\n\n---\n\n/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      {segments.map((seg, i) => {
        if (seg.startsWith("data:image/")) {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- HF trả về data URL inline
            <img
              key={i}
              src={seg}
              alt=""
              className={`max-h-[min(85vh,920px)] w-auto max-w-full rounded-xl border object-contain shadow-lg ${
                isDark ? "border-slate-600" : "border-slate-200"
              }`}
            />
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {seg}
          </p>
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
                className={isDark ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}
              >
                <FileDown size={14} />
                {exportingFormat ? "Đang export..." : "Export"}
              </Button>
            )}
            <Button
              onClick={onDeleteSelectedProject}
              variant="destructive"
              size="sm"
              className={isDark ? "border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-950/70" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}
            >
              Xóa project
            </Button>
          </div>
        </div>

        <div className={`p-4 rounded-xl mb-6 shadow-sm border self-end ml-auto max-w-[85%] ${
          isDark ? "bg-slate-800/80 border-slate-700 text-slate-100" : "bg-blue-50 text-blue-900 border-blue-100"
        }`}>
          <p className={`font-semibold text-xs mb-1 uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-700"}`}>Your Prompt</p>
          <p className="text-sm font-medium whitespace-pre-wrap">{selectedProject.prompt}</p>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border mb-8 w-full max-w-[95%] ${
          isDark ? "bg-slate-800/60 border-slate-700 text-slate-200" : "bg-white border-slate-100 text-slate-700"
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white">
              <Sparkles size={12} />
            </div>
            <span className="font-bold text-sm">AI Generated Content</span>
          </div>
          <div className={`prose prose-sm max-w-none ${isDark ? "prose-invert" : "prose-slate"}`}>
            {renderGeneratedContent(selectedProject.content, isDark)}
          </div>
        </div>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="max-w-3xl mx-auto pt-10 px-4 h-full flex flex-col justify-center">
        <h2 className={`text-3xl md:text-4xl font-extrabold mb-2 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>Create New Project</h2>
        <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-10`}>Instruct the AI to generate a creative story below.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center pt-10 lg:pt-20">
      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-blue-300 shadow-md mb-6"></div>
      <h2 className={`text-3xl md:text-4xl font-extrabold mb-3 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
        Hi, there
      </h2>
      <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-12 text-center`}>
        Select a project from the sidebar or create a new one to begin.
      </p>
      <Button onClick={onStartCreating} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-sm transition-colors flex items-center gap-2">
        <Plus size={18} /> Start Creative Project
      </Button>
    </div>
  );
}
