"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { downloadMarkdown, downloadPdf, downloadWord } from "@/lib/export_project";
import { clearPersonalHfApiKey, getPersonalHfApiKey, setPersonalHfApiKey } from "@/lib/personal_hf";
import { TranslationMode, translateProjectForExport } from "@/lib/translate_for_export";
import { getTemplateById } from "@/lib/landing_templates";
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
  isVideoModelId,
} from "@/lib/hf_models";
import ProjectSidebar from "@/components/workspace/project_sidebar";
import ProjectStage from "@/components/workspace/project_stage";
import VirtualPet from "@/components/workspace/virtual_pet";
import WorkspaceComposerDock, { ModelGroup } from "@/components/workspace/composer_bar";
import WorkspaceModals from "@/components/workspace/workspace_modals";
import { useWorkspaceStore, Project, TeamWorkspace, CanonCharacter, CanonLocation } from "@/store/useWorkspaceStore";
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
  FileDown,
  Mic,
  Radio,
} from "lucide-react";

interface VideoChatMessage {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  videoUrl?: string;
  assistantText?: string;
  error?: string;
  loading?: boolean;
}

type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface SpeechRecognitionResultEventLike {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

const VIDEO_CONTEXT_MAX_CHARS = 12000;

function buildProjectRequestHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token && token !== "undefined" && token !== "null") {
    headers.Authorization = `Bearer ${token}`;
  }
  const hf = getPersonalHfApiKey();
  if (hf) headers["X-HF-Api-Key"] = hf;
  return headers;
}

const VIENEU_SERVICE_URL = "https://kiwi-1106-vienue-tts.hf.space";

async function generateAudioDirect(text: string, voice: string): Promise<string> {
  const params = new URLSearchParams({ text, voice });
  const res = await fetch(`${VIENEU_SERVICE_URL}/generate?${params}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `TTS service HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.audio_b64) throw new Error("TTS service returned no audio");
  return data.audio_b64 as string;
}

async function attachAudioToProject(projectId: string, audioB64: string): Promise<void> {
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("audio_b64", audioB64);
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/attach-audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Attach audio failed:", err);
  }
}

function buildVideoGenerateRequestBody(
  prompt: string,
  selectedProject: Project | null,
  isCreating: boolean,
  draftTitle: string,
  videoMessages: VideoChatMessage[]
): { prompt: string; project_id?: string; context?: string; project_title?: string; provider: string } {
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

  const payload: { prompt: string; project_id?: string; context?: string; project_title?: string; provider: string } = {
    prompt,
    provider: "fal",   // default; caller will override
  };
  if (project_id) payload.project_id = project_id;
  if (project_title) payload.project_title = project_title;
  if (context) payload.context = context;
  return payload;
}

export default function DashboardPage() {
  const router = useRouter();
  const {
    isDark,
    setIsDark,
    userEmail,
    setUserEmail,
    userProfile,
    setUserProfile,
    projects,
    setProjects,
    selectedProject,
    setSelectedProject,
    teams,
    setTeams,
    selectedTeamId,
    setSelectedTeamId,
    newTeamName,
    setNewTeamName,
    teamToken,
    setTeamToken,
    isCreatingTeam,
    setIsCreatingTeam,
    isProfileOpen,
    setIsProfileOpen,
    isPersonalizeOpen,
    setIsPersonalizeOpen,
    isProjectSettingsOpen,
    setIsProjectSettingsOpen,
    isCanonModalOpen,
    setIsCanonModalOpen,
    isExportPanelOpen,
    setIsExportPanelOpen,
    modelName,
    setModelName,
    creativity,
    setCreativity,
    language,
    setLanguage,
    minWords,
    setMinWords,
    maxWords,
    setMaxWords,
    lengthOption,
    setLengthOption,
    personalHfKeyActive,
    setPersonalHfKeyActive,
    exportFormatChoice,
    exportTranslationMode,
    exportingFormat,
    setExportingFormat,
    canonCharacters,
    setCanonCharacters,
    canonLocations,
    setCanonLocations,
    isLoadingCanon,
    setIsLoadingCanon,
    activeCanonTab,
    setActiveCanonTab,
    newCharDisplayName,
    setNewCharDisplayName,
    selectedCharForVariant,
    setSelectedCharForVariant,
    outfitSummary,
    setOutfitSummary,
    faceMarksInput,
    setFaceMarksInput,
    newLocDisplayName,
    setNewLocDisplayName,
    newLocEnvTags,
    setNewLocEnvTags,
  } = useWorkspaceStore();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [continuePrompt, setContinuePrompt] = useState("");
  const [title, setTitle] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasSelectedProject = Boolean(selectedProject);
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const isImageModel = isImageModelId(modelName);
  const isAudioModel = isAudioModelId(modelName);
  const isVideoModel = isVideoModelId(modelName);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [personalizeKeyInput, setPersonalizeKeyInput] = useState("");
  const [personalizeMessage, setPersonalizeMessage] = useState("");

  const [videoMessages, setVideoMessages] = useState<VideoChatMessage[]>([]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);

  // File attachments and voice recording states
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFileContent, setAttachedFileContent] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const continueQueueRef = useRef<string[]>([]);
  const [queueLength, setQueueLength] = useState(0);

  // Voice cloning states
  const [selectedVoice, setSelectedVoice] = useState("Bình An");
  const [userVoices, setUserVoices] = useState<{ id: string; name: string; sample_url: string }[]>([]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  const fetchUserVoices = useCallback(async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/audio/voices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const voices = await res.json();
        setUserVoices(voices);
      }
    } catch (e) { /* ignore */ }
  }, []);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      voiceMediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(voiceChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("name", `Giọng của tôi`);
        formData.append("sample", blob, "voice_sample.webm");
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
        try {
          const res = await fetch(`${API_BASE_URL}/api/audio/voices`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (res.ok) {
            const voice = await res.json();
            setUserVoices(prev => [...prev, voice]);
            setSelectedVoice(voice.name);
            alert("Đã lưu giọng nói thành công!");
          } else {
            alert("Lỗi lưu giọng nói.");
          }
        } catch (e) { alert("Lỗi kết nối."); }
        stream.getTracks().forEach(t => t.stop());
        setShowVoiceRecorder(false);
      };
      mediaRecorder.start();
      setIsRecordingVoice(true);
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); setIsRecordingVoice(false); }, 6000);
    } catch (e) {
      alert("Không thể truy cập microphone. Vui lòng cấp quyền.");
    }
  };

  // Load voices on mount
  useEffect(() => { fetchUserVoices(); }, [fetchUserVoices]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Dung lượng file tối đa là 5MB.");
      return;
    }

    setAttachedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setAttachedFileContent(text || "");
    };
    reader.onerror = () => {
      alert("Không thể đọc nội dung file này.");
      setAttachedFile(null);
      setAttachedFileContent("");
    };
    reader.readAsText(file);
  };

  const clearAttachedFile = () => {
    setAttachedFile(null);
    setAttachedFileContent("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Speech Recognition). Hãy thử trên Chrome hoặc Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = language === "vietnamese" ? "vi-VN" : "en-US";

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        if (selectedProject) {
          setContinuePrompt(prev => prev + (prev ? " " : "") + transcript);
        } else {
          setPrompt(prev => prev + (prev ? " " : "") + transcript);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

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

  const fetchProjects = useCallback(async () => {
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
  }, []);

  const fetchTeams = useCallback(async () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
        setSelectedTeamId((current) => current || data[0]?.id || "");
      }
    } catch (e) {
      console.error("Failed to fetch teams", e);
    }
  }, []);

  useEffect(() => {
    setPersonalHfKeyActive(Boolean(getPersonalHfApiKey()));
  }, []);

  // Mouse tracking logic for premium gravity parallax and ambient glow
  useEffect(() => {
    if (!isDark) return;
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
  }, [isDark]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get("template");
    const template = getTemplateById(templateId);
    if (!template) return;
    setIsCreating(true);
    setSelectedProject(null);
    setPrompt(template.promptText);
    setTitle((prev) => prev || template.title);
    setMinWords(1000);
    setMaxWords(2000);
    setLengthOption("1000");
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
  }, [router, fetchProjects, fetchTeams]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    if (isProjectSettingsOpen && selectedProject && selectedTeamId) {
      fetchProjectTeamToken(selectedProject.id, selectedTeamId);
    }
  }, [isProjectSettingsOpen, selectedProject, selectedTeamId]);

  const mainWasNearBottomRef = useRef(true);

  const updateMainBottomFlag = React.useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return true;
    const thresholdPx = 140;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = gap <= thresholdPx;
    mainWasNearBottomRef.current = isNearBottom;
    return isNearBottom;
  }, []);

  useEffect(() => {
    const showComposer = isCreating || hasSelectedProject;
    if (!showComposer) return;

    const el = mainScrollRef.current;
    if (!el) return;

    updateMainBottomFlag();
    const onScroll = () => updateMainBottomFlag();
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [isCreating, hasSelectedProject, updateMainBottomFlag]);

  // Auto-scroll logic when streaming
  const isScrollingRef = useRef(false);
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;

    if (mainWasNearBottomRef.current && !isScrollingRef.current) {
      isScrollingRef.current = true;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        mainWasNearBottomRef.current = true;
        isScrollingRef.current = false;
      });
    }
  }, [selectedProject?.content, videoMessages]);

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
        
        // Sync project word limits
        if (data.min_words && data.max_words) {
          setMinWords(data.min_words);
          setMaxWords(data.max_words);
          if (data.min_words === 800 && data.max_words === 1200) {
            setLengthOption("1000");
          } else if (data.min_words === 1800 && data.max_words === 2200) {
            setLengthOption("2000");
          } else if (data.min_words === 2800 && data.max_words === 3200) {
            setLengthOption("3000");
          } else {
            setLengthOption("custom");
          }
        } else {
          setMinWords(1000);
          setMaxWords(2000);
          setLengthOption("1000");
        }
        if (data.content && data.content.trim()) {
          try {
            const parsed = JSON.parse(data.content);
            if (Array.isArray(parsed)) {
              setVideoMessages(parsed);
            } else {
              setVideoMessages([]);
            }
          } catch {
            if (data.content.includes("http") || data.content.includes(".mp4")) {
              setVideoMessages([
                { id: "msg-1", role: "user", prompt: data.prompt },
                { id: "msg-2", role: "assistant", videoUrl: data.content }
              ]);
            } else {
              setVideoMessages([]);
            }
          }
        } else {
          setVideoMessages([]);
        }
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCanonOverview = useCallback(async () => {
    if (!selectedProject?.id) return;
    setIsLoadingCanon(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/canon/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCanonCharacters(data.characters || []);
        setCanonLocations(data.locations || []);
      }
    } catch (e) {
      console.error("Lỗi khi tải thông tin canon:", e);
    } finally {
      setIsLoadingCanon(false);
    }
  }, [selectedProject?.id]);

  const handleAddCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharDisplayName.trim() || !selectedProject?.id) return;

    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    const slug = newCharDisplayName.trim().toLowerCase().replace(/\s+/g, "_");
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/canon/characters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slug, display_name: newCharDisplayName.trim() }),
      });
      if (res.ok) {
        setNewCharDisplayName("");
        fetchCanonOverview();
      } else {
        const err = await res.json();
        alert(err.detail || "Không thể thêm nhân vật.");
      }
    } catch (e) {
      console.error("Lỗi thêm nhân vật:", e);
      alert("Đã xảy ra lỗi.");
    }
  };

  const handleSaveVisualVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCharForVariant || !selectedProject?.id) return;

    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/canon/visual-variant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          character_slug: selectedCharForVariant.slug,
          label: "default",
          outfit_summary: outfitSummary.trim(),
          face_marks_json: faceMarksInput.trim() ? [{ type: "description", value: faceMarksInput.trim() }] : [],
        }),
      });
      if (res.ok) {
        alert("Đã lưu cấu hình ngoại hình nhân vật!");
        setSelectedCharForVariant(null);
        setOutfitSummary("");
        setFaceMarksInput("");
        fetchCanonOverview();
      } else {
        const err = await res.json();
        alert(err.detail || "Không thể lưu ngoại hình.");
      }
    } catch (e) {
      console.error("Lỗi lưu ngoại hình nhân vật:", e);
      alert("Đã xảy ra lỗi.");
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocDisplayName.trim() || !selectedProject?.id) return;

    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    const slug = newLocDisplayName.trim().toLowerCase().replace(/\s+/g, "_");
    const env_style_tags = newLocEnvTags.trim() ? newLocEnvTags.split(",").map(t => t.trim()) : [];
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/canon/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slug, display_name: newLocDisplayName.trim(), env_style_tags }),
      });
      if (res.ok) {
        setNewLocDisplayName("");
        setNewLocEnvTags("");
        fetchCanonOverview();
      } else {
        const err = await res.json();
        alert(err.detail || "Không thể thêm địa điểm.");
      }
    } catch (e) {
      console.error("Lỗi thêm địa điểm:", e);
      alert("Đã xảy ra lỗi.");
    }
  };

  useEffect(() => {
    if (isCanonModalOpen && selectedProject?.id) {
      fetchCanonOverview();
    }
  }, [isCanonModalOpen, selectedProject?.id, fetchCanonOverview]);

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

  const handleAutoGenerateTitle = async () => {
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      alert("Vui lòng nhập Prompt trước để AI có dữ liệu đặt tên.");
      return;
    }
    setIsGeneratingTitle(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/generate-title`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify({ prompt: rawPrompt, language }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          setTitle(data.title);
        }
      } else {
        const fallback = rawPrompt.slice(0, 30) + (rawPrompt.length > 30 ? "..." : "");
        setTitle(fallback);
      }
    } catch (e) {
      console.error("Lỗi tự động đặt tên:", e);
      const fallback = rawPrompt.slice(0, 30) + (rawPrompt.length > 30 ? "..." : "");
      setTitle(fallback);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleOptimizePrompt = async () => {
    const rawPrompt = selectedProject ? continuePrompt.trim() : prompt.trim();
    if (!rawPrompt) {
      alert("Vui lòng nhập Prompt trước khi tối ưu.");
      return;
    }
    setIsOptimizingPrompt(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/optimize-prompt`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify({ prompt: rawPrompt, language }),
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.optimized_prompt) {
          if (selectedProject) {
            setContinuePrompt(data.optimized_prompt);
          } else {
            setPrompt(data.optimized_prompt);
          }
        }
      } else {
        alert("Không thể tối ưu prompt. Vui lòng thử lại sau.");
      }
    } catch (e) {
      console.error("Lỗi tối ưu prompt:", e);
      alert("Không kết nối được server để tối ưu prompt.");
    } finally {
      setIsOptimizingPrompt(false);
    }
  };

  const handleCreateProject = async () => {
    if (!prompt.trim()) {
      alert("Vui lòng nhập Prompt để AI tạo nội dung.");
      return;
    }

    if (isGenerating) return;

    let finalTitle = title.trim();
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");

    // Tự động gọi API tự đặt tên nếu chưa nhập tên project
    if (!finalTitle) {
      setIsGeneratingTitle(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/projects/generate-title`, {
          method: "POST",
          headers: buildProjectRequestHeaders(token),
          body: JSON.stringify({ prompt: prompt.trim(), language }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            finalTitle = data.title;
            setTitle(data.title);
          }
        }
      } catch (e) {
        console.error("Lỗi tự động đặt tên khi tạo project:", e);
      } finally {
        setIsGeneratingTitle(false);
      }

      if (!finalTitle) {
        finalTitle = prompt.trim().slice(0, 30) + (prompt.length > 30 ? "..." : "");
      }
    }

    const isTextModel = !isAudioModelId(modelName) && !isImageModelId(modelName) && !isVideoModelId(modelName);
    const streamParam = isTextModel ? "?stream=true" : "";

    setIsGenerating(true);
    const promptText = prompt;
    let finalPromptText = promptText;
    if (attachedFile && attachedFileContent) {
      finalPromptText = `${promptText}\n\n--- [Nội dung file: ${attachedFile.name}] ---\n${attachedFileContent}\n---`;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${streamParam}`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify(toProjectCreateApiPayload({ title: finalTitle, prompt: finalPromptText, language, modelName: modelName.trim(), minWords, maxWords, voice: isAudioModel ? selectedVoice : undefined })),
      });
      if (res.ok) {
        if (isTextModel) {
          setTitle("");
          setPrompt("");
          setIsCreating(false);
          clearAttachedFile();

          setSelectedProject({
            id: "",
            title: finalTitle,
            prompt: promptText,
            content: "Waiting for LLM generation..."
          });

          const reader = res.body?.getReader();
          if (!reader) {
            alert("Không thể đọc stream từ server.");
            setIsGenerating(false);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let accumulatedText = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              let currentEvent = "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith("event:")) {
                  currentEvent = trimmed.slice(6).trim();
                } else if (trimmed.startsWith("data:")) {
                  const dataStr = trimmed.slice(5).trim();
                  try {
                    const payload = JSON.parse(dataStr);
                    if (currentEvent === "init") {
                      const pid = payload.id;
                      setSelectedProject(prev => {
                        if (!prev) return null;
                        return { ...prev, id: pid };
                      });
                    } else if (currentEvent === "chunk") {
                      accumulatedText += payload.text;
                      setSelectedProject(prev => {
                        if (!prev) return null;
                        return { ...prev, content: accumulatedText };
                      });
                    } else if (currentEvent === "done") {
                      const finalContent = typeof payload.content === "string" ? payload.content : null;
                      if (finalContent !== null) {
                        setSelectedProject(prev => {
                          if (!prev) return null;
                          return { ...prev, content: finalContent };
                        });
                      }
                      fetchProjects();
                    } else if (currentEvent === "error") {
                      alert(`Stream error: ${payload.detail}`);
                    }
                  } catch (err) {
                    console.error("JSON parse error on stream line:", line, err);
                  }
                }
              }
            }
          } catch (streamReadErr) {
            console.error("Error reading stream:", streamReadErr);
          } finally {
            fetchProjects();
          }
        } else {
          const data = await res.json();
          setTitle("");
          setPrompt("");
          setIsCreating(false);
          clearAttachedFile();
          setSelectedProject(data);
          fetchProjects();

          if (isAudioModel) {
            const textForTTS = promptText;
            (async () => {
              try {
                const audioB64 = await generateAudioDirect(textForTTS, selectedVoice);
                await attachAudioToProject(data.id, audioB64);
                fetchProjects();
              } catch (ttsErr) {
                console.error("TTS direct call failed:", ttsErr);
              }
            })();
          }
        }
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

  const handleContinueProject = async (overridePrompt?: string) => {
    if (!selectedProject) return;

    const isTextModel = !isAudioModelId(modelName) && !isImageModelId(modelName) && !isVideoModelId(modelName);
    const promptText = overridePrompt !== undefined ? overridePrompt : continuePrompt;

    if (isContinuing) {
      if (isTextModel) {
        let queuedPrompt = promptText;
        if (attachedFile && attachedFileContent) {
          queuedPrompt = `${promptText}\n\n--- [Nội dung file: ${attachedFile.name}] ---\n${attachedFileContent}\n---`;
          clearAttachedFile();
        }
        continueQueueRef.current.push(queuedPrompt);
        setQueueLength(continueQueueRef.current.length);
        setContinuePrompt("");
      }
      return;
    }

    if (!isTextModel && !continuePrompt.trim()) {
      alert("Vui lòng nhập yêu cầu viết tiếp.");
      return;
    }

    const streamParam = isTextModel ? "?stream=true" : "";

    setIsContinuing(true);
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    let finalPromptText = promptText;
    if (overridePrompt === undefined && attachedFile && attachedFileContent) {
      finalPromptText = `${promptText}\n\n--- [Nội dung file: ${attachedFile.name}] ---\n${attachedFileContent}\n---`;
      clearAttachedFile();
    } else if (overridePrompt === undefined) {
      clearAttachedFile();
    }
    setContinuePrompt("");
    const prevContent = selectedProject.content || "";

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProject.id}/continue${streamParam}`, {
        method: "POST",
        headers: buildProjectRequestHeaders(token),
        body: JSON.stringify(toProjectContinueApiPayload({ prompt: finalPromptText, language, modelName: modelName.trim(), minWords, maxWords, voice: isAudioModel ? selectedVoice : undefined })),
      });
      if (res.ok) {
        if (isTextModel) {
          const reader = res.body?.getReader();
          if (!reader) {
            alert("Không thể đọc stream từ server.");
            setIsContinuing(false);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let accumulatedText = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              let currentEvent = "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith("event:")) {
                  currentEvent = trimmed.slice(6).trim();
                } else if (trimmed.startsWith("data:")) {
                  const dataStr = trimmed.slice(5).trim();
                  try {
                    const payload = JSON.parse(dataStr);
                    if (currentEvent === "chunk") {
                      accumulatedText += payload.text;
                      setSelectedProject(prev => {
                        if (!prev) return null;
                        const userPromptChunk = promptText.trim() ? `[[USER_PROMPT]]\n${promptText.trim()}` : "";
                        const continuationChunk = userPromptChunk ? `${userPromptChunk}\n\n---\n\n${accumulatedText}` : accumulatedText;
                        const baseContent = prevContent.trim();
                        const fullContent = baseContent ? `${baseContent}\n\n---\n\n{continuationChunk}` : continuationChunk;
                        // Replace standard brace pattern with actual value
                        return { ...prev, content: fullContent.replace("{continuationChunk}", continuationChunk) };
                      });
                    } else if (currentEvent === "done") {
                      const finalContent = typeof payload.content === "string" ? payload.content : null;
                      if (finalContent !== null) {
                        setSelectedProject(prev => {
                          if (!prev) return null;
                          return { ...prev, content: finalContent };
                        });
                      }
                      fetchProjects();
                    } else if (currentEvent === "error") {
                      alert(`Stream error: ${payload.detail}`);
                    }
                  } catch (err) {
                    console.error("JSON parse error on stream line:", line, err);
                  }
                }
              }
            }
          } catch (streamReadErr) {
            console.error("Error reading stream:", streamReadErr);
          } finally {
            fetchProjects();
          }
        } else {
          const data = await res.json();
          setSelectedProject(data);
          fetchProjects();

          if (isAudioModel) {
            (async () => {
              try {
                const audioB64 = await generateAudioDirect(promptText, selectedVoice);
                await attachAudioToProject(data.id, audioB64);
                fetchProjects();
              } catch (ttsErr) {
                console.error("TTS direct call (continue) failed:", ttsErr);
              }
            })();
          }
        }
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
        if (overridePrompt === undefined) {
          setContinuePrompt(promptText);
        }
      }
    } catch (e) {
      console.error(e);
      if (overridePrompt === undefined) {
        setContinuePrompt(promptText);
      }
    } finally {
      setIsContinuing(false);
      setTimeout(() => {
        if (continueQueueRef.current.length > 0) {
          const nextPrompt = continueQueueRef.current.shift();
          setQueueLength(continueQueueRef.current.length);
          if (nextPrompt !== undefined) {
            void handleContinueProject(nextPrompt);
          }
        }
      }, 100);
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
      videoBody.provider = modelName === "kling-video" ? "kling" : "fal";
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

      if (data.project_id) {
        await fetchProjects();
        await handleSelectProject(data.project_id);
      }
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
    if (isVideoModel) {
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
                Yêu cầu của bạn
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
              <span className="font-bold text-sm">Trợ lý AI</span>
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
                  controls
                  playsInline
                  preload="auto"
                  className="w-full max-w-full rounded-xl border border-slate-200 max-h-[min(70vh,520px)] bg-black object-contain"
                >
                  <source src={m.videoUrl} type="video/mp4" />
                </video>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );

  return (
    <div className={`flex h-screen p-2 sm:p-4 font-sans transition-colors duration-300 ${isDark ? "gravity-surface bg-[#040812] text-slate-100" : "bg-slate-100 text-slate-900"}`}>
      <div
        className={`flex w-full h-full rounded-[2rem] overflow-hidden shadow-sm z-10 relative transition-all duration-300 ${
          isDark ? "bg-slate-900/40 backdrop-blur-xl border border-white/10 text-white shadow-black/45" : "bg-white border border-slate-200"
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
            setMinWords(1000);
            setMaxWords(2000);
            setLengthOption("1000");
          }}
          onOpenSettings={() => {
            if (!selectedProject) {
              alert("Vui lòng chọn dự án trước.");
              return;
            }
            setIsProjectSettingsOpen(true);
          }}
          onOpenCanon={() => setIsCanonModalOpen(true)}
        />

        <div className={`flex-1 flex flex-col relative transition-all duration-300 ${isDark ? "bg-transparent" : "bg-white"}`}>
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
                      Đăng nhập với
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
                    Hồ sơ người dùng
                  </button>
                  <button
                    type="button"
                    onClick={openPersonalize}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark ? "text-slate-200 hover:bg-slate-800 hover:text-amber-300" : "text-slate-700 hover:bg-slate-50 hover:text-amber-700"
                    }`}
                  >
                    <KeyRound size={16} />
                    Cá nhân hóa
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
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </header>

          <main
            ref={mainScrollRef}
            data-testid="workspace-scroll-container"
            className="flex-1 overflow-y-auto px-4 pb-8"
          >
            {isVideoModel && selectedProject ? (
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
                        {exportingFormat ? "Đang xuất..." : "Xuất file"}
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
                      Xóa dự án
                    </Button>
                  </div>
                </div>
                {renderVideoThread()}
                {videoMessages.length === 0 && (
                  <p className={`text-center text-sm font-medium mt-4 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nhập mô tả video dưới khung chat và nhấn Tạo video.
                  </p>
                )}
              </div>
            ) : isVideoModel && isCreating ? (
              <div className="max-w-3xl mx-auto pt-10 px-4 h-full flex flex-col justify-center">
                <h2 className={`text-3xl md:text-4xl font-extrabold mb-2 tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  Tạo dự án mới
                </h2>
                <p className={`${isDark ? "text-slate-400" : "text-slate-500"} font-medium mb-8`}>
                  Chế độ Video: nhập mô tả bên dưới để tạo video (không tạo nội dung chữ cho dự án).
                </p>
                {renderVideoThread()}
                {videoMessages.length === 0 && (
                  <p className={`text-sm font-medium text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nhập prompt video và nhấn Tạo video.
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
                  setMinWords(1000);
                  setMaxWords(2000);
                  setLengthOption("1000");
                }}
                isStreaming={isGenerating || isContinuing}
                draftTitle={title}
                onSetDraftTitle={setTitle}
                onAutoGenerateTitle={handleAutoGenerateTitle}
                isGeneratingTitle={isGeneratingTitle}
              />
            )}
            <div ref={bottomRef} data-testid="workspace-scroll-bottom" className="h-0 w-0" />
          </main>

          <WorkspaceComposerDock
            isVisible={Boolean(isCreating || selectedProject)}
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
            isVideoModel={isVideoModel}
            onSubmit={handleBottomSubmit}
            personalHfKeyActive={personalHfKeyActive}
            isDark={isDark}
            attachedFile={attachedFile}
            isRecording={isRecording}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            clearAttachedFile={clearAttachedFile}
            toggleSpeechRecognition={toggleSpeechRecognition}
            minWords={minWords}
            setMinWords={setMinWords}
            maxWords={maxWords}
            setMaxWords={setMaxWords}
            lengthOption={lengthOption}
            setLengthOption={setLengthOption}
            queueLength={queueLength}
            onOptimizePrompt={handleOptimizePrompt}
            isOptimizing={isOptimizingPrompt}
            selectedVoice={selectedVoice}
            setSelectedVoice={setSelectedVoice}
            userVoices={userVoices}
            onOpenVoiceRecorder={() => setShowVoiceRecorder(true)}
          />

          <VirtualPet
            isDark={isDark}
            isGenerating={isGenerating || isContinuing || isGeneratingVideo}
          />

          {/* ─── Voice Recorder Modal ─── */}
          {showVoiceRecorder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowVoiceRecorder(false)}>
              <div
                className={`p-6 rounded-2xl shadow-xl max-w-sm w-full ${isDark ? "bg-slate-900 border border-white/10" : "bg-white"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>Thu âm giọng nói</h3>
                <p className={`text-xs mb-4 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Đọc to vài câu trong 5 giây để AI clone giọng của bạn.
                </p>
                <div className="flex justify-center gap-3">
                  {isRecordingVoice ? (
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-2 animate-pulse">
                        <Mic size={28} className="text-red-500" />
                      </div>
                      <p className={`text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>Đang thu... (5s)</p>
                    </div>
                  ) : (
                    <Button
                      onClick={startVoiceRecording}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 cursor-pointer"
                    >
                      <Mic size={16} /> Bắt đầu thu âm
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVoiceRecorder(false)}
                  className={`mt-4 w-full text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
                >
                  Đóng
                </Button>
              </div>
            </div>
          )}

          <WorkspaceModals
            currentPasswordState={{
              value: currentPassword,
              setValue: setCurrentPassword,
            }}
            newPasswordState={{
              value: newPassword,
              setValue: setNewPassword,
            }}
            changingPassword={changingPassword}
            passwordError={passwordError}
            passwordMessage={passwordMessage}
            onChangePassword={handleChangePassword}
            onAddCharacter={handleAddCharacter}
            onSaveVisualVariant={handleSaveVisualVariant}
            onAddLocation={handleAddLocation}
            onExportProject={handleExportProject}
            personalizeKeyInput={personalizeKeyInput}
            setPersonalizeKeyInput={setPersonalizeKeyInput}
            personalizeMessage={personalizeMessage}
            onSavePersonalizeKey={savePersonalizeKey}
            onClearPersonalizeKey={clearPersonalizeKey}
          />
        </div>
      </div>
    </div>
  );
}
