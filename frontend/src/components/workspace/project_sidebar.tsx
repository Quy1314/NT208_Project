"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { MessageSquare, Plus, Settings, Sparkles, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Project = {
  id: string;
  title: string;
  prompt: string;
  content: string;
};

type TeamWorkspace = {
  id: string;
  name: string;
};

type ProjectSidebarProps = {
  isDark: boolean;
  projects: Project[];
  selectedProject: Project | null;
  newTeamName: string;
  setNewTeamName: (v: string) => void;
  isCreatingTeam: boolean;
  selectedTeamId: string;
  setSelectedTeamId: (v: string) => void;
  teams: TeamWorkspace[];
  onCreateTeam: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string, e?: MouseEvent) => void;
  onCreateProjectStart: () => void;
  onOpenSettings: () => void;
  onOpenCanon: () => void;
};

export default function ProjectSidebar({
  isDark,
  projects,
  selectedProject,
  newTeamName,
  setNewTeamName,
  isCreatingTeam,
  selectedTeamId,
  setSelectedTeamId,
  teams,
  onCreateTeam,
  onSelectProject,
  onDeleteProject,
  onCreateProjectStart,
  onOpenSettings,
  onOpenCanon,
}: ProjectSidebarProps) {
  return (
    <div data-tour="tour-sidebar" className={`w-64 border-r flex flex-col pt-6 pb-4 px-4 hidden md:flex transition-all duration-300 ${
      isDark ? "bg-slate-900/40 backdrop-blur-xl border-white/10 text-white shadow-black/45" : "bg-slate-50 border-slate-100"
    }`}>
      <Link 
        href="/landing" 
        className={`flex items-center gap-3 px-2 py-1.5 mb-8 rounded-lg transition-colors ${
          isDark ? "hover:bg-white/5" : "hover:bg-slate-800/40"
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <Sparkles size={16} />
        </div>
        <span className={`font-bold text-lg tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>Trợ lý AI</span>
      </Link>

      <Button
        data-tour="tour-new-project-button"
        onClick={onCreateProjectStart}
        variant="outline"
        className={`mb-6 w-full justify-start gap-2 rounded-xl text-sm font-semibold transition-all ${
          isDark
            ? "bg-slate-950/40 border-white/10 text-slate-200 hover:border-blue-500/50 hover:text-blue-400"
            : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600"
        }`}
      >
        <Plus size={18} />
        Dự án mới
      </Button>

      <div className="flex-1 overflow-y-auto">
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 px-2 ${isDark ? "text-slate-400" : "text-slate-400"}`}>
          Dự án gần đây
        </div>
        <div className="space-y-1">
          {projects.map((proj) => (
            <div key={proj.id} className="group relative flex items-center w-full">
              <button
                onClick={() => onSelectProject(proj.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  selectedProject?.id === proj.id 
                    ? isDark ? "bg-white/10 text-white" : "bg-blue-50 text-blue-700" 
                    : isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <MessageSquare size={16} className={selectedProject?.id === proj.id ? "text-blue-400" : isDark ? "text-slate-500 group-hover:text-blue-400" : "text-slate-400 group-hover:text-blue-500"} />
                <span className="truncate flex-1 pr-6">{proj.title}</span>
              </button>
              <button
                onClick={(e) => onDeleteProject(proj.id, e)}
                title="Xóa dự án"
                className={`absolute right-2 p-1 transition-opacity ${
                  selectedProject?.id === proj.id
                    ? "opacity-100 text-red-500"
                    : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                }`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/10" : "border-t border-slate-200"}`}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-2 px-2 ${isDark ? "text-slate-300" : "text-slate-400"}`}>
          Không gian nhóm
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Tên nhóm"
              className={`h-8 flex-1 text-xs ${
                isDark
                  ? "border-white/10 bg-slate-950/40 text-slate-100 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-blue-500/20 focus-visible:border-blue-500/50"
                  : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
              }`}
            />
            <Button 
              onClick={onCreateTeam} 
              disabled={isCreatingTeam} 
              className="h-8 px-2 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
            >
              {isCreatingTeam ? "..." : "Tạo"}
            </Button>
          </div>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${
              isDark
                ? "border-white/10 bg-slate-950/40 text-slate-100 focus:border-blue-500/50"
                : "border-slate-200 bg-white text-slate-900 focus:border-blue-500"
            }`}
          >
            <option value="">Chọn nhóm</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`mt-auto pt-4 border-t ${isDark ? "border-white/10" : "border-t border-slate-200/60"}`}>
        {selectedProject && (
          <button
            onClick={onOpenCanon}
            className={`w-full flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg text-sm font-medium transition-colors ${
              isDark ? "text-slate-300 hover:bg-white/5 text-white" : "text-slate-700 hover:bg-slate-100 text-slate-900"
            }`}
          >
            <Sparkles size={18} className="text-slate-400" />
            Nhân vật & Canon
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isDark ? "text-slate-300 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <Settings size={18} className="text-slate-400" />
          Cài đặt
        </button>
      </div>
    </div>
  );
}
