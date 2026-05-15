"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { downloadMarkdown, downloadPdf, downloadWord } from "@/lib/export_project";
import { clearPersonalHfApiKey, getPersonalHfApiKey, setPersonalHfApiKey } from "@/lib/personal_hf";
import { TranslationMode, translateProjectForExport } from "@/lib/translate_for_export";
import { getTemplatePromptById } from "@/lib/landing_templates";
import {
  toProjectContinueApiPayload,
  toProjectCreateApiPayload,
} from "@/lib/api_adapters";
import {
  allHfModelIds,
  hfImageModelOptions,
  hfModelGroups,
  isAudioModelId,
  isImageModelId,
} from "@/lib/hf_models";
import ProjectSidebar from "@/components/workspace/project_sidebar";
import ProjectStage from "@/components/workspace/project_stage";
import type { ModelGroup } from "@/components/workspace/composer_bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  LogOut,
  User,
  Sparkles,
  ChevronDown,
  X,
  Moon,
  Sun,
  KeyRound,
  Mic,
  Paperclip,
  FileDown,
} from "lucide-react";

function buildProjectRequestHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token && token !== "undefined" && token !== "null") {
    headers.Authorization = `Bearer ${token}`;
  }
  const hf = getPersonalHfApiKey();
  if (hf) headers["X-HF-Api-Key"] = hf;
  return headers;
}

interface Project {
  id: string;
  title: string;
  prompt: string;
  content: string;
}

interface TeamWorkspace {
  id: string;
  name: string;
}

type ChatMode = "text" | "video";

interface VideoChatMessage {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  videoUrl?: string;
  assistantText?: string;
  error?: string;
  loading?: boolean;
}

const VIDEO_CONTEXT_MAX_CHARS = 12000;

/** Build optional project/chat grounding for video generation (server merges into the fal prompt). */
function buildVideoGenerateRequestBody(
  prompt: string,
  selectedProject: Project | null,
  isCreating: boolean,
  draftTitle: string,
  videoMessages: VideoChatMessage[]
): { prompt: string; project_id?: string; context?: string; project_title?: string } {
  const parts: string[] = [];

  if (selectedProject) {
    const setup = selectedProject.prompt?.trim();
    if (setup) parts.push(`Story setup / original prompt:\n${setup}`);
    const body = selectedProject.content?.trim();
    if (body && body !== "Waiting for LLM generation...") {
      let slice = body;
      if (slice.length > 8000) slice = `${slice.slice(0, 8000)}\n[...story truncated]`;
      parts.push(`Generated story content:\n${slice}`);
    }
  } else if (isCreating && draftTitle.trim()) {
    parts.push(`Working title:\n${draftTitle.trim()}`);
  }

  const history: string[] = [];
  for (const m of videoMessages) {
    if (m.role === "user" && m.prompt?.trim()) history.push(`User (video): ${m.prompt.trim()}`);
    else if (m.role === "assistant" && !m.loading) {
      if (m.assistantText?.trim()) history.push(`Assistant: ${m.assistantText.trim()}`);
      if (m.error) history.push(`Assistant (error): ${m.error}`);
    }
  }
  if (history.length) parts.push(`Prior video chat in this session:\n${history.join("\n")}`);

  let context = parts.join("\n\n").trim();
  if (context.length > VIDEO_CONTEXT_MAX_CHARS) {
    context = `${context.slice(0, VIDEO_CONTEXT_MAX_CHARS)}\n[...truncated]`;
  }

  const project_title =
    selectedProject?.title?.trim() || (isCreating ? draftTitle.trim() : "") || undefined;
  const project_id = selectedProject?.id;

  const payload: { prompt: string; project_id?: string; context?: string; project_title?: string } = {
    prompt,
  };
  if (project_id) payload.project_id = project_id;
  if (project_title) payload.project_title = project_title;
  if (context) payload.context = context;
  return payload;
}

type WorkspaceComposerDockProps = {
  isVisible: boolean;
  isMainAtBottom: boolean;
  selectedProject: Project | null;
  prompt: string;
  continuePrompt: string;
  setPrompt: (v: string) => void;
  setContinuePrompt: (v: string) => void;
  modelGroups: ModelGroup[];
  allModelIds: string[];
  modelName: string;
  setModelName: (v: string) => void;
  isImageModel: boolean;
  isAudioModel: boolean;
  creativity: string;
  setCreativity: (v: string) => void;
  language: "vietnamese" | "english";
  setLanguage: (v: "vietnamese" | "english") => void;
  isGenerating: boolean;
  isContinuing: boolean;
  isGeneratingVideo: boolean;
  chatMode: ChatMode;
  setChatMode: (m: ChatMode) => void;
  onSubmit: () => void;
  personalHfKeyActive: boolean;
};

function WorkspaceComposerDock({
  isVisible,
  isMainAtBottom,
  selectedProject,
  prompt,
  continuePrompt,
  setPrompt,
  setContinuePrompt,
  modelGroups,
  allModelIds,
  modelName,
  setModelName,
  isImageModel,
  isAudioModel,
  creativity,
  setCreativity,
  language,
  setLanguage,
  isGenerating,
  isContinuing,
  isGeneratingVideo,
  chatMode,
  setChatMode,
  onSubmit,
  personalHfKeyActive,
}: WorkspaceComposerDockProps) {
  if (!isVisible) return null;

  const isVideo = chatMode === "video";
  const isBusy = isVideo ? isGeneratingVideo : selectedProject ? isContinuing : isGenerating;
  const safeModel = allModelIds.includes(modelName) ? modelName : allModelIds[0];

  const placeholderText = isVideo
    ? "Mô tả cảnh / nội dung video bạn muốn tạo..."
    : selectedProject
      ? isImageModel
        ? "Mô tả ảnh tiếp theo (tiếng Anh thường cho kết quả tốt hơn)..."
        : isAudioModel
          ? "Nhập nội dung hoặc lời thoại để tạo audio tiếp theo..."
          : "Nhập yêu cầu để AI viết tiếp dự án này..."
      : isImageModel
        ? "Mô tả ảnh bạn muốn tạo (tiếng Anh thường cho kết quả tốt hơn)..."
        : isAudioModel
          ? "Nhập nội dung/lời thoại để AI tạo audio..."
          : "Describe your story, characters, and plot here...";

  const primaryLabel = isVideo
    ? "Generate"
    : selectedProject
      ? isImageModel
        ? "Thêm ảnh"
        : isAudioModel
          ? "Thêm audio"
          : "Viết tiếp"
      : isImageModel
        ? "Tạo ảnh"
        : isAudioModel
          ? "Tạo audio"
          : "Generate";

  const busyLabel = isVideo
    ? "Đang tạo video..."
    : selectedProject
      ? isImageModel
        ? "Đang tạo ảnh..."
        : isAudioModel
          ? "Đang tạo audio..."
          : "Đang viết tiếp..."
      : isImageModel
        ? "Đang tạo ảnh..."
        : isAudioModel
          ? "Đang tạo audio..."
          : "Generating...";

  return (
    <div
      className={`absolute bottom-6 left-1/2 z-30 w-[95%] max-w-4xl -translate-x-1/2 sm:w-[85%] transition-all duration-300 ease-out ${
        isMainAtBottom
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-8 opacity-0"
      }`}
    >
      <div className="bg-[#1b1c20] border border-[#2a2c31] shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-3xl p-3 flex flex-col gap-2 transition-all">
        <Textarea
          value={selectedProject ? continuePrompt : prompt}
          onChange={(e) => (selectedProject ? setContinuePrompt(e.target.value) : setPrompt(e.target.value))}
          placeholder={placeholderText}
          className="w-full max-h-32 min-h-[60px] p-3 text-[#f3f4f6] border-0 shadow-none focus-visible:ring-0 resize-none placeholder-[#6b7280] bg-transparent font-medium"
        />

        <div className="flex items-center justify-between pt-1 px-2 border-t border-[#2a2c31]/50 mt-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <select
              value={safeModel}
              onChange={(e) => setModelName(e.target.value)}
              title="Model Hugging Face (LLM hoặc text-to-image)"
              className="text-xs font-semibold text-[#d4d4d8] bg-[#2a2c31] border border-[#3f3f46] px-3 py-1.5 rounded-lg max-w-[min(100%,20rem)] font-mono truncate"
            >
              {modelGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!isVideo && !isImageModel && !isAudioModel && (
              <select
                value={creativity}
                onChange={(e) => setCreativity(e.target.value)}
                className="text-xs font-semibold text-[#d4d4d8] bg-[#2a2c31] border border-[#3f3f46] px-3 py-1.5 rounded-lg"
              >
                <option>Focused</option>
                <option>Balanced</option>
                <option>Creative</option>
              </select>
            )}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "vietnamese" | "english")}
              className="text-xs font-semibold text-[#d4d4d8] bg-[#2a2c31] border border-[#3f3f46] px-3 py-1.5 rounded-lg"
            >
              <option value="vietnamese">vietnamese</option>
              <option value="english">english</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex rounded-lg border border-[#3f3f46] overflow-hidden text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setChatMode("text")}
                className={`px-3 py-1.5 transition-colors ${
                  chatMode === "text"
                    ? "bg-indigo-600 text-white"
                    : "bg-[#2a2c31] text-[#a1a1aa] hover:text-white"
                }`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setChatMode("video")}
                className={`px-3 py-1.5 transition-colors border-l border-[#3f3f46] ${
                  chatMode === "video"
                    ? "bg-indigo-600 text-white"
                    : "bg-[#2a2c31] text-[#a1a1aa] hover:text-white"
                }`}
              >
                Video
              </button>
            </div>
            <Button variant="ghost" size="sm" className="text-[#a1a1aa] hover:text-white hover:bg-[#2a2c31]">
              <Paperclip size={14} /> Attach
            </Button>
            <Button variant="ghost" size="sm" className="text-[#a1a1aa] hover:text-white hover:bg-[#2a2c31]">
              <Mic size={14} /> Voice
            </Button>

            <Button
              onClick={onSubmit}
              disabled={isBusy}
              className={`ml-2 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all shadow-md ${
                isBusy
                  ? "bg-indigo-500/50 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 hover:shadow-lg"
              }`}
            >
              {isBusy ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin"></div>
                  {busyLabel}
                </>
              ) : (
                <>
                  <Sparkles size={16} /> {primaryLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      {personalHfKeyActive && (
        <p className="text-center mt-2 text-[10px] text-amber-400/90 font-medium font-sans">
          Đang dùng Hugging Face token cá nhân (Personalize).
        </p>
      )}
      <div className="text-center mt-3 text-[10px] text-slate-400 font-medium font-sans">
        AI may display inaccurate info, so please double check the response.
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [prompt, setPrompt] = useState("");
  const [continuePrompt, setContinuePrompt] = useState("");
  const [title, setTitle] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const [isMainAtBottom, setIsMainAtBottom] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [modelName, setModelName] = useState("Qwen/Qwen2.5-72B-Instruct");
  const isImageModel = isImageModelId(modelName);
  const isAudioModel = isAudioModelId(modelName);
  const [creativity, setCreativity] = useState("Balanced");
  const [language, setLanguage] = useState<"vietnamese" | "english">("vietnamese");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ id: string; email: string; created_at: string } | null>(null);
  const [teams, setTeams] = useState<TeamWorkspace[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [teamToken, setTeamToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isDark, setIsDark] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<null | "md" | "pdf" | "docx">(null);
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false);
  const [exportFormatChoice, setExportFormatChoice] = useState<"md" | "pdf" | "docx">("md");
  const [exportTranslationMode, setExportTranslationMode] = useState<TranslationMode>("none");
  const [isPersonalizeOpen, setIsPersonalizeOpen] = useState(false);
  const [personalizeKeyInput, setPersonalizeKeyInput] = useState("");
  const [personalizeMessage, setPersonalizeMessage] = useState("");
  const [personalHfKeyActive, setPersonalHfKeyActive] = useState(false);

  const [chatMode, setChatMode] = useState<ChatMode>("text");
  const [videoMessages, setVideoMessages] = useState<VideoChatMessage[]>([]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  const fetchUserProfile = async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
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

  const fetchTeams = async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
        if (!selectedTeamId && data.length > 0) setSelectedTeamId(data[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch teams", e);
    }
  };

  useEffect(() => {
    setPersonalHfKeyActive(Boolean(getPersonalHfApiKey()));
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get("template");
    const templatePrompt = getTemplatePromptById(templateId);
    if (!templatePrompt) return;
    setIsCreating(true);
    setSelectedProject(null);
    setPrompt(templatePrompt);
    setTitle((prev) => prev || "AI Template Draft");
  }, []);

  useEffect(() => {
    if (!allHfModelIds.includes(modelName)) {
      setModelName(allHfModelIds[0]);
    }
  }, [modelName]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsDark(false);
    } else if (savedTheme === "dark") {
      setIsDark(true);
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") {
      handleLogout();
      return;
    }

    const email = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "User";
    setUserEmail(email);

    fetchProjects();
    fetchTeams();

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  useEffect(() => {
    if (isProjectSettingsOpen && selectedProject && selectedTeamId) {
      fetchProjectTeamToken(selectedProject.id, selectedTeamId);
    }
  }, [isProjectSettingsOpen, selectedProject, selectedTeamId]);

  const updateMainBottomFlag = React.useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const thresholdPx = 80;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsMainAtBottom(gap <= thresholdPx);
  }, []);

  useEffect(() => {
    const showComposer = isCreating || Boolean(selectedProject);
    if (!showComposer) return;

    const el = mainScrollRef.current;
    if (!el) return;

    updateMainBottomFlag();
    const onScroll = () => updateMainBottomFlag();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateMainBottomFlag());
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [isCreating, selectedProject, selectedProject?.content, videoMessages, updateMainBottomFlag]);

  const handleSelectProject = async (id: string) => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data);
        setIsCreating(false);
        setContinuePrompt("");
        setVideoMessages([]);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Bạn có chắc muốn xoá dự án này không?")) return;
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    setIsCreatingTeam(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newTeamName }),
      });
      const data = await res.json();
      if (res.ok) {
        setTeams((prev) => [...prev, data]);
        setSelectedTeamId(data.id);
        setNewTeamName("");
      } else {
        alert(data.detail || "Không thể tạo team.");
      }
    } catch {
      alert("Lỗi kết nối khi tạo team.");
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const fetchProjectTeamToken = async (projectId: string, teamId: string) => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/project-token?project_id=${projectId}&team_id=${teamId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTeamToken(data.token || "");
      } else {
        setTeamToken("");
      }
    } catch {
      setTeamToken("");
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      alert("Không thể copy.");
    }
  };

  const handleExportProject = async (format: "md" | "pdf" | "docx", translationMode: TranslationMode = "none") => {
    if (!selectedProject) return;
    let { title, prompt, content } = selectedProject;
    if (!content?.trim() || content === "Waiting for LLM generation...") {
      alert("Chưa có nội dung AI để xuất.");
      return;
    }
    setExportingFormat(format);
    try {
      if (translationMode !== "none") {
        try {
          const translated = await translateProjectForExport({ title, prompt, content }, translationMode);
          title = translated.title;
          prompt = translated.prompt;
          content = translated.content;
        } catch (translationErr) {
          console.error("Translation before export failed:", translationErr);
          const fallbackMsg =
            translationErr instanceof Error ? translationErr.message : "Không gọi được translation API.";
          alert(
            `Không thể dịch trước khi export (${fallbackMsg}). Hệ thống sẽ xuất file gốc (không dịch).`
          );
        }
      }
      if (format === "md") downloadMarkdown(title, prompt, content);
      else if (format === "docx") await downloadWord(title, prompt, content);
      else await downloadPdf(title, prompt, content);
      setIsExportPanelOpen(false);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Xuất file thất bại: ${msg}`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleCreateProject = async () => {
    if (!prompt.trim()) {
      alert("Vui lòng nhập Prompt để AI tạo nội dung.");
      return;
    }

    const finalTitle = title.trim() ? title : prompt.trim().slice(0, 30) + (prompt.length > 30 ? "..." : "");

    if (isGenerating) return;

    setIsGenerating(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify(toProjectCreateApiPayload({ title: finalTitle, prompt, language, modelName: modelName.trim() })),
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
        let msg = "Có lỗi xảy ra khi tạo dự án.";
        try {
          const errBody = await res.json();
          if (typeof errBody.detail === "string") msg = errBody.detail;
          else if (Array.isArray(errBody.detail))
            msg = errBody.detail.map((x: unknown) => JSON.stringify(x)).join("; ");
        } catch {
          /* ignore */
        }
        alert(msg);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinueProject = async () => {
    if (!selectedProject) return;
    if (!continuePrompt.trim()) {
      alert("Vui lòng nhập yêu cầu viết tiếp.");
      return;
    }
    if (isContinuing) return;

    setIsContinuing(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/continue`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify(toProjectContinueApiPayload({ prompt: continuePrompt, language, modelName: modelName.trim() })),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data);
        setContinuePrompt("");
        fetchProjects();
      } else if (res.status === 401) {
        handleLogout();
      } else {
        let msg = "Có lỗi xảy ra khi viết tiếp dự án.";
        try {
          const errBody = await res.json();
          if (typeof errBody.detail === "string") msg = errBody.detail;
          else if (Array.isArray(errBody.detail))
            msg = errBody.detail.map((x: unknown) => JSON.stringify(x)).join("; ");
        } catch {
          /* ignore */
        }
        alert(msg);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsContinuing(false);
    }
  };

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_email");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user_email");
    clearPersonalHfApiKey();

    window.location.href = "/logout";
  }

  const openPersonalize = () => {
    setIsUserMenuOpen(false);
    setPersonalizeKeyInput(getPersonalHfApiKey() || "");
    setPersonalizeMessage("");
    setIsPersonalizeOpen(true);
  };

  const savePersonalizeKey = () => {
    const k = personalizeKeyInput.trim();
    if (!k) {
      clearPersonalHfApiKey();
      setPersonalHfKeyActive(false);
      setPersonalizeMessage("Đã xóa key HF cá nhân.");
      return;
    }
    setPersonalHfApiKey(k);
    setPersonalHfKeyActive(true);
    setPersonalizeMessage("Đã lưu. Key chỉ dùng trong tab này, không lưu trên server.");
  };

  const clearPersonalizeKey = () => {
    setPersonalizeKeyInput("");
    clearPersonalHfApiKey();
    setPersonalHfKeyActive(false);
    setPersonalizeMessage("Đã xóa key HF cá nhân.");
  };

  const handleChangePassword = async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    if (!currentPassword || !newPassword) {
      setPasswordError("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
      return;
    }

    setChangingPassword(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.detail || "Không thể đổi mật khẩu.");
        return;
      }
      setPasswordMessage(data.message || "Đổi mật khẩu thành công.");
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setPasswordError("Lỗi kết nối máy chủ.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleVideoGenerate = async () => {
    const raw = selectedProject ? continuePrompt : prompt;
    const trimmed = raw.trim();
    if (!trimmed) {
      alert("Vui lòng nhập mô tả video.");
      return;
    }
    if (isGeneratingVideo) return;

    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setVideoMessages((prev) => [
      ...prev,
      { id: `u-${assistantId}`, role: "user", prompt: trimmed },
      { id: assistantId, role: "assistant", loading: true },
    ]);
    setIsGeneratingVideo(true);

    try {
      const videoBody = buildVideoGenerateRequestBody(
        trimmed,
        selectedProject,
        isCreating,
        title,
        videoMessages
      );
      const res = await fetch(`${API_BASE_URL}/api/video/generate`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify(videoBody),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();

      if (data.error) {
        setVideoMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, loading: false, error: String(data.error) } : m))
        );
        return;
      }

      if (!res.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d: { msg?: string }) => d.msg).join(", ")
              : "Không thể tạo video.";
        setVideoMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, loading: false, error: detail } : m))
        );
        return;
      }

      setVideoMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                loading: false,
                videoUrl: data.video_url as string,
                assistantText: (data.message as string) || undefined,
              }
            : m
        )
      );
      if (selectedProject) setContinuePrompt("");
      else setPrompt("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi kết nối.";
      setVideoMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, loading: false, error: msg } : m))
      );
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleBottomSubmit = () => {
    if (chatMode === "video") {
      void handleVideoGenerate();
    } else if (selectedProject) {
      void handleContinueProject();
    } else {
      void handleCreateProject();
    }
  };

  const renderVideoThread = () => (
    <div className="space-y-6">
      {videoMessages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="flex justify-end px-1">
            <div
              className={`p-4 rounded-xl shadow-sm border max-w-[85%] ${
                isDark ? "bg-slate-800/80 border-slate-700 text-slate-100" : "bg-blue-50 text-blue-900 border-blue-100"
              }`}
            >
              <p
                className={`font-semibold text-xs mb-1 uppercase tracking-wider ${
                  isDark ? "text-blue-300" : "text-blue-700"
                }`}
              >
                Your Prompt
              </p>
              <p className="text-sm font-medium whitespace-pre-wrap">{m.prompt}</p>
            </div>
          </div>
        ) : (
          <div
            key={m.id}
            className={`p-6 rounded-2xl shadow-sm border w-full max-w-[95%] ${
              isDark ? "bg-slate-800/60 border-slate-700 text-slate-200" : "bg-white border-slate-100 text-slate-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white">
                <Sparkles size={12} />
              </div>
              <span className="font-bold text-sm">Assistant</span>
            </div>
            {m.loading && (
              <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-200"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animation-delay-400"></div>
                <span className="ml-2 text-sm">Đang tạo video...</span>
              </div>
            )}
            {m.error && <p className="text-sm text-red-600 whitespace-pre-wrap leading-relaxed">{m.error}</p>}
            {!m.loading && m.videoUrl && (
              <div className="space-y-3">
                {m.assistantText && <p className="text-sm whitespace-pre-wrap opacity-90">{m.assistantText}</p>}
                <video
                  src={m.videoUrl}
                  controls
                  playsInline
                  className="w-full max-w-full rounded-xl border border-slate-200 max-h-[min(70vh,520px)] bg-black object-contain"
                />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );

  const showVideoStage = chatMode === "video" && (isCreating || selectedProject);

  return (
    <div className={`flex h-screen p-2 sm:p-4 font-sans ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}>
      <div
        className={`flex w-full h-full rounded-[2rem] overflow-hidden shadow-sm ${
          isDark ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-200"
        }`}
      >
        <ProjectSidebar
          isDark={isDark}
          projects={projects}
          selectedProject={selectedProject}
          newTeamName={newTeamName}
          setNewTeamName={setNewTeamName}
          isCreatingTeam={isCreatingTeam}
          selectedTeamId={selectedTeamId}
          setSelectedTeamId={setSelectedTeamId}
          teams={teams}
          onCreateTeam={handleCreateTeam}
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onCreateProjectStart={() => {
            setIsCreating(true);
            setSelectedProject(null);
            setTitle("");
            setPrompt("");
            setContinuePrompt("");
            setVideoMessages([]);
          }}
          onOpenSettings={() => {
            if (!selectedProject) {
              alert("Vui lòng chọn project trước.");
              return;
            }
            setIsProjectSettingsOpen(true);
          }}
        />

        <div className={`flex-1 flex flex-col relative ${isDark ? "bg-slate-900" : "bg-white"}`}>
          <header className="flex justify-between items-center p-5 lg:px-8">
            <div className="md:hidden flex items-center gap-2 font-bold">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
                <Sparkles size={12} />
              </div>
              AI Generator
            </div>
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/landing"
                className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  isDark
                    ? "text-cyan-200 border-cyan-500/40 bg-slate-800 hover:bg-slate-700"
                    : "text-cyan-700 border-cyan-200 bg-cyan-50 hover:bg-cyan-100"
                }`}
              >
                Trang chủ
              </Link>
              <span
                className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                  isDark ? "text-slate-100 bg-slate-800" : "text-slate-800 bg-slate-100"
                }`}
              >
                Test GPT Plus
              </span>
            </div>

            <div className="relative flex items-center gap-2" ref={userMenuRef}>
              <button
                onClick={toggleTheme}
                className={`rounded-full p-2 border transition-colors ${
                  isDark
                    ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                title={isDark ? "Chuyển sáng" : "Chuyển tối"}
              >
                {isDark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className={`flex items-center gap-2 p-1.5 pr-3 rounded-full border transition-colors ${
                  isDark ? "hover:bg-slate-800 border-slate-700" : "hover:bg-slate-50 border-slate-200"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center uppercase">
                  {userEmail ? userEmail.charAt(0) : "U"}
                </div>
                <span
                  className={`text-sm font-semibold hidden sm:block max-w-[120px] truncate ${
                    isDark ? "text-slate-100" : "text-slate-700"
                  }`}
                >
                  {userEmail}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div
                  className={`absolute right-0 mt-2 w-56 rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
                    isDark ? "bg-slate-900 border border-slate-700" : "bg-white border border-slate-100"
                  }`}
                >
                  <div className={`px-4 py-3 mb-1 ${isDark ? "border-b border-slate-700" : "border-b border-slate-100"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Signed in as
                    </p>
                    <p className={`text-sm font-bold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>{userEmail}</p>
                  </div>
                  <button
                    onClick={fetchUserProfile}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark ? "text-slate-200 hover:bg-slate-800 hover:text-blue-300" : "text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                    }`}
                  >
                    <User size={16} />
                    User Profile
                  </button>
                  <button
                    type="button"
                    onClick={openPersonalize}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark ? "text-slate-200 hover:bg-slate-800 hover:text-amber-300" : "text-slate-700 hover:bg-slate-50 hover:text-amber-700"
                    }`}
                  >
                    <KeyRound size={16} />
                    Personalize
                    {personalHfKeyActive && (
                      <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        HF
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleLogout}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors mt-1 ${
                      isDark ? "hover:bg-red-950/40 border-t border-slate-800" : "hover:bg-red-50 border-t border-slate-50"
                    }`}
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </header>

          <main
            ref={mainScrollRef}
            className={`flex-1 overflow-y-auto px-4 ${isCreating || selectedProject ? "pb-40" : "pb-8"}`}
          >
            {showVideoStage && selectedProject ? (
              <div className="max-w-3xl mx-auto pt-10 px-4">
                <div className="mb-6 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className={`text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{selectedProject.title}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedProject.content?.trim() && selectedProject.content !== "Waiting for LLM generation..." && (
                      <Button
                        type="button"
                        onClick={() => setIsExportPanelOpen(true)}
                        disabled={exportingFormat !== null}
                        variant="outline"
                        size="sm"
                        className={
                          isDark
                            ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }
                      >
                        <FileDown size={14} />
                        {exportingFormat ? "Đang export..." : "Export"}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDeleteProject(selectedProject.id)}
                      variant="destructive"
                      size="sm"
                      className={
                        isDark
                          ? "border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-950/70"
                          : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      }
                    >
                      Xóa project
                    </Button>
                  </div>
                </div>
                {renderVideoThread()}
                {videoMessages.length === 0 && (
                  <p className={`text-center text-sm font-medium mt-4 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nhập mô tả video dưới khung chat và nhấn Generate.
                  </p>
                )}
              </div>
            ) : showVideoStage && isCreating ? (
              <div className="max-w-3xl mx-auto pt-10 px-4 h-full flex flex-col justify-center">
                <h2 className={`text-3xl md:text-4xl font-extrabold mb-2 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  Create New Project
                </h2>
                <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-8`}>
                  Chế độ Video: nhập mô tả bên dưới để tạo video (không tạo nội dung chữ cho project).
                </p>
                {renderVideoThread()}
                {videoMessages.length === 0 && (
                  <p className={`text-sm font-medium text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nhập prompt video và nhấn Generate.
                  </p>
                )}
              </div>
            ) : (
              <ProjectStage
                isDark={isDark}
                selectedProject={selectedProject}
                isCreating={isCreating}
                exportingFormat={exportingFormat}
                onOpenExport={() => setIsExportPanelOpen(true)}
                onDeleteSelectedProject={() => selectedProject && handleDeleteProject(selectedProject.id)}
                onStartCreating={() => {
                  setIsCreating(true);
                  setVideoMessages([]);
                }}
              />
            )}
          </main>

          <WorkspaceComposerDock
            isVisible={Boolean(isCreating || selectedProject)}
            isMainAtBottom={isMainAtBottom}
            selectedProject={selectedProject}
            prompt={prompt}
            continuePrompt={continuePrompt}
            setPrompt={setPrompt}
            setContinuePrompt={setContinuePrompt}
            modelGroups={hfModelGroups}
            allModelIds={allHfModelIds}
            modelName={modelName}
            setModelName={setModelName}
            isImageModel={isImageModel}
            isAudioModel={isAudioModel}
            creativity={creativity}
            setCreativity={setCreativity}
            language={language}
            setLanguage={setLanguage}
            isGenerating={isGenerating}
            isContinuing={isContinuing}
            isGeneratingVideo={isGeneratingVideo}
            chatMode={chatMode}
            setChatMode={setChatMode}
            onSubmit={handleBottomSubmit}
            personalHfKeyActive={personalHfKeyActive}
          />

          {isProfileOpen && (
            <>
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
                onClick={() => setIsProfileOpen(false)}
              ></div>

              <div className="absolute top-0 right-0 w-full sm:w-[420px] h-full bg-[#1b1c20] shadow-[0_0_40px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center p-6 border-b border-transparent">
                  <button
                    onClick={() => setIsProfileOpen(false)}
                    className="text-[#8c8f99] hover:text-white transition-colors p-1 -ml-1"
                  >
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
                      {userProfile?.email.split("@")[0]}
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
                      {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleString("vi-VN") : "N/A"}
                    </div>
                  </div>

                  <div className="border-t border-[#32353d] pt-4 mt-2 space-y-3">
                    <label className="block text-[13px] font-semibold text-[#e5e7eb]">Đổi mật khẩu</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Mật khẩu hiện tại"
                      className="w-full bg-[#2a2c31] rounded-xl px-4 py-3 text-[14px] text-[#f3f4f6] outline-none border border-transparent focus:border-blue-500"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mật khẩu mới (>= 8 ký tự)"
                      className="w-full bg-[#2a2c31] rounded-xl px-4 py-3 text-[14px] text-[#f3f4f6] outline-none border border-transparent focus:border-blue-500"
                    />
                    {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
                    {passwordMessage && <p className="text-xs text-emerald-400">{passwordMessage}</p>}
                    <button
                      onClick={handleChangePassword}
                      disabled={changingPassword}
                      className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold px-4 py-2.5 transition-colors"
                    >
                      {changingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {isPersonalizeOpen && (
            <>
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
                onClick={() => setIsPersonalizeOpen(false)}
              />
              <div className="absolute top-0 right-0 w-full sm:w-[420px] h-full bg-[#1b1c20] shadow-[0_0_40px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between border-b border-[#32353d] px-6 py-4">
                  <div>
                    <h3 className="text-white font-semibold">Personalize</h3>
                    <p className="text-xs text-[#8c8f99] mt-0.5">Hugging Face Inference API</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPersonalizeOpen(false)}
                    className="text-[#8c8f99] hover:text-white transition-colors p-1"
                    aria-label="Đóng"
                  >
                    <X size={20} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  <p className="text-sm text-[#cdd0d5] leading-relaxed">
                    Dán <strong className="text-white">HF token</strong> của bạn để gọi model lớn qua tài khoản của bạn.
                    Key chỉ lưu trong <strong className="text-white">sessionStorage</strong> của trình duyệt, gửi kèm
                    request sinh nội dung — không lưu trên server.
                  </p>
                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2">HF API token</label>
                    <input
                      type="password"
                      value={personalizeKeyInput}
                      onChange={(e) => setPersonalizeKeyInput(e.target.value)}
                      placeholder="hf_..."
                      autoComplete="off"
                      className="w-full bg-[#2a2c31] rounded-xl px-4 py-3 text-[14px] text-[#f3f4f6] outline-none border border-transparent focus:border-blue-500 font-mono text-sm"
                    />
                  </div>
                  {personalizeMessage && <p className="text-xs text-emerald-400">{personalizeMessage}</p>}
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={savePersonalizeKey}
                      className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 transition-colors"
                    >
                      Lưu key (phiên hiện tại)
                    </button>
                    <button
                      type="button"
                      onClick={clearPersonalizeKey}
                      className="w-full rounded-xl border border-[#3f3f46] text-[#e5e7eb] hover:bg-[#2a2c31] font-semibold px-4 py-2.5 transition-colors"
                    >
                      Xóa key
                    </button>
                  </div>
                  <p className="text-[11px] text-[#6b7280] leading-relaxed">
                    Model khi sinh nội dung chỉ được chọn trong{" "}
                    <strong className="text-[#9ca3af]">dropdown trên thanh chat</strong> (danh sách đã cài đặt). Token HF
                    cá nhân chỉ thay key gọi API; không có token thì server dùng key mặc định (nếu có).
                  </p>
                  <div className="rounded-xl border border-[#32353d] bg-[#111317] p-3">
                    <p className="text-[11px] font-semibold text-[#cdd0d5] mb-2">Model ảnh free gợi ý (Hugging Face)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hfImageModelOptions.map((id) => (
                        <span
                          key={id}
                          className="rounded-md bg-[#2a2c31] px-2 py-1 text-[10px] font-mono text-[#d1d5db]"
                          title={id}
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {isProjectSettingsOpen && selectedProject && (
            <>
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
                onClick={() => setIsProjectSettingsOpen(false)}
              />
              <div className="absolute top-0 right-0 w-full sm:w-[420px] h-full bg-[#1b1c20] shadow-[0_0_40px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between p-6">
                  <h3 className="text-white font-semibold">Project Settings</h3>
                  <button onClick={() => setIsProjectSettingsOpen(false)} className="text-[#8c8f99] hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                <div className="px-6 space-y-4">
                  <div className="rounded-xl bg-[#2a2c31] p-3">
                    <p className="text-xs text-slate-300 mb-1">Project ID</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white break-all">{selectedProject.id}</p>
                      <button onClick={() => copyText(selectedProject.id)} className="text-xs text-blue-300">
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#2a2c31] p-3">
                    <p className="text-xs text-slate-300 mb-1">Team ID</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white break-all">{selectedTeamId || "Chưa chọn team"}</p>
                      {selectedTeamId && (
                        <button onClick={() => copyText(selectedTeamId)} className="text-xs text-blue-300">
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#2a2c31] p-3">
                    <p className="text-xs text-slate-300 mb-1">Team Token</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white break-all">{teamToken || "Chưa có token (chọn team trước)"}</p>
                      {teamToken && (
                        <button onClick={() => copyText(teamToken)} className="text-xs text-blue-300">
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {isExportPanelOpen && selectedProject && (
            <>
              <div
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] z-40 animate-in fade-in"
                onClick={() => exportingFormat === null && setIsExportPanelOpen(false)}
              />
              <div className="absolute top-0 right-0 w-full sm:w-[420px] h-full bg-[#1b1c20] shadow-[0_0_40px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between border-b border-[#32353d] px-6 py-4">
                  <div>
                    <h3 className="text-white font-semibold">Export project</h3>
                    <p className="text-xs text-[#8c8f99] mt-0.5">Tùy chọn file và translation trước khi tải</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsExportPanelOpen(false)}
                    disabled={exportingFormat !== null}
                    className="text-[#8c8f99] hover:text-white transition-colors p-1 disabled:opacity-50"
                    aria-label="Đóng"
                  >
                    <X size={20} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2">Định dạng file</label>
                    <select
                      value={exportFormatChoice}
                      onChange={(e) => setExportFormatChoice(e.target.value as "md" | "pdf" | "docx")}
                      disabled={exportingFormat !== null}
                      className="w-full bg-[#2a2c31] rounded-xl px-4 py-3 text-[14px] text-[#f3f4f6] outline-none border border-transparent focus:border-blue-500"
                    >
                      <option value="md">Markdown (.md)</option>
                      <option value="docx">Word (.docx)</option>
                      <option value="pdf">PDF (.pdf)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2">
                      Translation trước khi export (google-t5/t5-base)
                    </label>
                    <select
                      value={exportTranslationMode}
                      onChange={(e) => setExportTranslationMode(e.target.value as TranslationMode)}
                      disabled={exportingFormat !== null}
                      className="w-full bg-[#2a2c31] rounded-xl px-4 py-3 text-[14px] text-[#f3f4f6] outline-none border border-transparent focus:border-blue-500"
                    >
                      <option value="none">Không dịch</option>
                      <option value="vi-to-en">Tiếng Việt → English</option>
                      <option value="en-to-vi">English → Tiếng Việt</option>
                    </select>
                    <p className="mt-2 text-[11px] text-[#6b7280] leading-relaxed">
                      Nếu bạn đã lưu HF token trong Personalize thì request translation sẽ dùng token đó.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportProject(exportFormatChoice, exportTranslationMode)}
                    disabled={exportingFormat !== null}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 transition-colors disabled:opacity-60"
                  >
                    {exportingFormat !== null ? "Đang xử lý..." : "Bắt đầu export"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
