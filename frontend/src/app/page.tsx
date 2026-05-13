    "use client";

    import React, { useState, useEffect, useRef } from "react";
    import { useRouter } from "next/navigation";
    import Link from "next/link";
    import { API_BASE_URL } from "@/lib/api";
    import { downloadMarkdown, downloadPdf, downloadWord } from "@/lib/exportProject";
    import { clearPersonalHfApiKey, getPersonalHfApiKey, setPersonalHfApiKey } from "@/lib/personalHf";
    import { TranslationMode, translateProjectForExport } from "@/lib/translateForExport";
    import { getTemplatePromptById } from "@/lib/landingTemplates";
    import {
      ALL_HF_MODEL_IDS,
      HF_IMAGE_MODEL_OPTIONS,
      HF_MODEL_GROUPS,
      isImageModelId,
    } from "@/lib/hfModels";
    import ProjectSidebar from "@/components/workspace/ProjectSidebar";
    import ProjectStage from "@/components/workspace/ProjectStage";
    import ComposerBar from "@/components/workspace/ComposerBar";
    import {
      LogOut,
      User,
      Sparkles,
      ChevronDown,
      X,
      Moon,
      Sun,
      KeyRound
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
      const [isGenerating, setIsGenerating] = useState(false); // Ngăn chặn Double-Submit (Race Conditions)
      const [isContinuing, setIsContinuing] = useState(false);
      const [modelName, setModelName] = useState("Qwen/Qwen2.5-72B-Instruct");
      const isImageModel = isImageModelId(modelName);
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
        if (!ALL_HF_MODEL_IDS.includes(modelName)) {
          setModelName(ALL_HF_MODEL_IDS[0]);
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

        // Auth check (Ưu tiên localStorage, nếu không có thì tìm trong sessionStorage)
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
        if (!token || token === "undefined" || token === "null") {
          handleLogout(); // Nếu không có token nào, đá văng ra login
          return;
        }

        const email = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "User";
        setUserEmail(email);

        fetchProjects();
        fetchTeams();

        // Handle click outside for dropdown
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
      }, [isCreating, selectedProject, selectedProject?.content, updateMainBottomFlag]);

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
            setContinuePrompt("");
          } else if (res.status === 401) {
            handleLogout();
          }
        } catch (e) {
          console.error(e);
        }
      };

      const handleDeleteProject = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation(); // prevent triggering select project
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
                translationErr instanceof Error
                  ? translationErr.message
                  : "Không gọi được translation API.";
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

        // Tự động tạo Title từ Prompt nếu người dùng không nhập
        const finalTitle = title.trim() ? title : (prompt.trim().slice(0, 30) + (prompt.length > 30 ? "..." : ""));

        // Ngăn chặn race condition (click liên tục 2 lần)
        if (isGenerating) return;

        setIsGenerating(true);
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
        try {
          const res = await fetch(`${API_BASE_URL}/api/projects/`, {
            method: "POST",
            headers: buildProjectRequestHeaders(token),
            body: JSON.stringify({ title: finalTitle, prompt, language, model_name: modelName.trim() }),
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
          setIsGenerating(false); // Reset cờ trạng thái
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
            body: JSON.stringify({ prompt: continuePrompt, language, model_name: modelName.trim() }),
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
        // Quét dọn sạch sẽ tất cả session & local storage (trừ cái remembered_email)
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
      return (
        <div className={`flex h-screen p-2 sm:p-4 font-sans ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}>
          {/* MAIN APP CONTAINER */}
          <div className={`flex w-full h-full rounded-[2rem] overflow-hidden shadow-sm ${
            isDark ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-200"
          }`}>

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
              }}
              onOpenSettings={() => {
                if (!selectedProject) {
                  alert("Vui lòng chọn project trước.");
                  return;
                }
                setIsProjectSettingsOpen(true);
              }}
            />

            {/* 2. MAIN CONTENT AREA */}
            <div className={`flex-1 flex flex-col relative ${isDark ? "bg-slate-900" : "bg-white"}`}>

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
                  <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${isDark ? "text-slate-100 bg-slate-800" : "text-slate-800 bg-slate-100"}`}>Test  GPT Plus</span>
                </div>

                {/* User Menu Dropdown */}
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
                    <span className={`text-sm font-semibold hidden sm:block max-w-[120px] truncate ${isDark ? "text-slate-100" : "text-slate-700"}`}>
                      {userEmail}
                    </span>
                    <ChevronDown size={14} className="text-slate-400" />
                  </button>

                  {/* Dropdown Panel */}
                  {isUserMenuOpen && (
                    <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
                      isDark ? "bg-slate-900 border border-slate-700" : "bg-white border border-slate-100"
                    }`}>
                      <div className={`px-4 py-3 mb-1 ${isDark ? "border-b border-slate-700" : "border-b border-slate-100"}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Signed in as</p>
                        <p className={`text-sm font-bold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>{userEmail}</p>
                      </div>
                      <button
                        onClick={fetchUserProfile}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isDark ? "text-slate-200 hover:bg-slate-800 hover:text-blue-300" : "text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                        }`}>
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

              {/* CENTER STAGE (Greeting & Cards) */}
              <main
                ref={mainScrollRef}
                className={`flex-1 overflow-y-auto px-4 ${isCreating || selectedProject ? "pb-40" : "pb-8"}`}
              >
                <ProjectStage
                  isDark={isDark}
                  selectedProject={selectedProject}
                  isCreating={isCreating}
                  exportingFormat={exportingFormat}
                  onOpenExport={() => setIsExportPanelOpen(true)}
                  onDeleteSelectedProject={() => selectedProject && handleDeleteProject(selectedProject.id)}
                  onStartCreating={() => setIsCreating(true)}
                />
              </main>

              <ComposerBar
                isVisible={Boolean(isCreating || selectedProject)}
                isMainAtBottom={isMainAtBottom}
                selectedProject={selectedProject}
                prompt={prompt}
                continuePrompt={continuePrompt}
                setPrompt={setPrompt}
                setContinuePrompt={setContinuePrompt}
                modelGroups={HF_MODEL_GROUPS}
                allModelIds={ALL_HF_MODEL_IDS}
                modelName={modelName}
                setModelName={setModelName}
                isImageModel={isImageModel}
                creativity={creativity}
                setCreativity={setCreativity}
                language={language}
                setLanguage={setLanguage}
                isGenerating={isGenerating}
                isContinuing={isContinuing}
                onSubmit={selectedProject ? handleContinueProject : handleCreateProject}
                personalHfKeyActive={personalHfKeyActive}
              />

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
                        Key chỉ lưu trong <strong className="text-white">sessionStorage</strong> của trình duyệt, gửi kèm request sinh nội dung — không lưu trên server.
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
                      {personalizeMessage && (
                        <p className="text-xs text-emerald-400">{personalizeMessage}</p>
                      )}
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
                        Model khi sinh nội dung chỉ được chọn trong <strong className="text-[#9ca3af]">dropdown trên thanh chat</strong> (danh sách đã cài đặt). Token HF cá nhân chỉ thay key gọi API; không có token thì server dùng key mặc định (nếu có).
                      </p>
                      <div className="rounded-xl border border-[#32353d] bg-[#111317] p-3">
                        <p className="text-[11px] font-semibold text-[#cdd0d5] mb-2">Model ảnh free gợi ý (Hugging Face)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {HF_IMAGE_MODEL_OPTIONS.map((id) => (
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
                      <button onClick={() => setIsProjectSettingsOpen(false)} className="text-[#8c8f99] hover:text-white"><X size={20} /></button>
                    </div>
                    <div className="px-6 space-y-4">
                      <div className="rounded-xl bg-[#2a2c31] p-3">
                        <p className="text-xs text-slate-300 mb-1">Project ID</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white break-all">{selectedProject.id}</p>
                          <button onClick={() => copyText(selectedProject.id)} className="text-xs text-blue-300">Copy</button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#2a2c31] p-3">
                        <p className="text-xs text-slate-300 mb-1">Team ID</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white break-all">{selectedTeamId || "Chưa chọn team"}</p>
                          {selectedTeamId && <button onClick={() => copyText(selectedTeamId)} className="text-xs text-blue-300">Copy</button>}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#2a2c31] p-3">
                        <p className="text-xs text-slate-300 mb-1">Team Token</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white break-all">{teamToken || "Chưa có token (chọn team trước)"}</p>
                          {teamToken && <button onClick={() => copyText(teamToken)} className="text-xs text-blue-300">Copy</button>}
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
