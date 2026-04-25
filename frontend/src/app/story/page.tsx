"use client";

import React from "react";
import { API_BASE_URL } from "@/lib/api";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  PencilLine,
  Sparkles,
} from "lucide-react";

type Language = "vietnamese" | "english";

interface ProjectResponse {
  id: string;
  title: string;
  prompt: string;
  content: string;
}

const initialForm = {
  title: "",
  language: "vietnamese" as Language,
  prompt: "",
};

function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  if (!token || token === "undefined" || token === "null") {
    return null;
  }
  return token;
}

function Spinner() {
  return <Loader2 className="h-5 w-5 animate-spin" />;
}

export default function Page() {
  const [form, setForm] = React.useState(initialForm);
  const [draft, setDraft] = React.useState<ProjectResponse | null>(null);
  const [continuePrompt, setContinuePrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [continuing, setContinuing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");

  const token = React.useMemo(() => getStoredToken(), []);

  const submitStory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Không tìm thấy JWT token. Hãy đăng nhập trước khi tạo story.");
      return;
    }

    if (!form.title.trim() || !form.prompt.trim()) {
      setError("Vui lòng nhập title và prompt trước khi tạo nội dung.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/story/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          language: form.language,
          prompt: form.prompt.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Không thể tạo draft.");
      }

      setDraft(data);
      setContinuePrompt("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Có lỗi xảy ra khi tạo story.");
    } finally {
      setLoading(false);
    }
  };

  const continueStory = async () => {
    if (!draft) {
      setError("Hãy tạo draft đầu tiên trước khi continue.");
      return;
    }

    if (!token) {
      setError("Không tìm thấy JWT token. Hãy đăng nhập trước khi continue.");
      return;
    }

    if (!continuePrompt.trim()) {
      setError("Vui lòng nhập yêu cầu tiếp theo.");
      return;
    }

    setContinuing(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/story/${draft.id}/continue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: continuePrompt.trim(),
          language: form.language,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Không thể sinh chapter tiếp theo.");
      }

      setDraft(data);
      setContinuePrompt("");
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "Có lỗi xảy ra khi continue story.");
    } finally {
      setContinuing(false);
    }
  };

  const copyDraft = async () => {
    if (!draft?.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setError("Không thể sao chép nội dung.");
    }
  };

  const downloadDraft = () => {
    if (!draft?.content) {
      return;
    }

    const blob = new Blob([draft.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.title || "story-draft"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1220_45%,#020617_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <Sparkles className="h-4 w-4" />
                Generate Story module
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Write a draft, review it, then continue the story in one flow.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                This screen follows the project flow: define title, language, and context, generate the first draft from the backend, then refine the story by sending a follow-up prompt for the next chapter.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[34rem]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 1</p>
                <p className="mt-2 text-sm font-medium text-white">Define context & characters</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 2</p>
                <p className="mt-2 text-sm font-medium text-white">Generate text draft</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Step 3</p>
                <p className="mt-2 text-sm font-medium text-white">Review, edit, continue</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={submitStory} className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Creation interface</h2>
                <p className="mt-1 text-sm text-slate-400">Enter a story brief and send it to the AI engine.</p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 sm:flex">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                JWT protected
              </div>
            </div>

            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="Example: The Last City of Ashes"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Language</span>
                  <select
                    value={form.language}
                    onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value as Language }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  >
                    <option value="vietnamese">Vietnamese</option>
                    <option value="english">English</option>
                  </select>
                </label>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">Prompt guidance</p>
                  <p className="mt-1 leading-6 text-slate-400">
                    Write the context, characters, atmosphere, and the exact part of the story you want the model to continue.
                  </p>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Story prompt</span>
                <textarea
                  value={form.prompt}
                  onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                  rows={10}
                  className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  placeholder="Define setting, main characters, conflict, tone, and the next scene you want the AI to write."
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <Spinner /> : <ArrowRight className="h-4 w-4" />}
                {loading ? "Generating draft..." : "Generate text draft"}
              </button>
            </div>
          </form>

          <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Draft display & continue</h2>
                <p className="mt-1 text-sm text-slate-400">Review, edit, export, then send the next instruction to continue the chapter.</p>
              </div>
              {draft ? (
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200">
                  Project {draft.id.slice(0, 8)}
                </div>
              ) : null}
            </div>

            {loading ? (
              <div className="space-y-4">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-full animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-11/12 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/10" />
                <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <Spinner />
                    AI is generating the draft, please wait 10-20 seconds.
                  </div>
                </div>
              </div>
            ) : draft ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Generated content</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">{draft.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyDraft}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        {copyState === "copied" ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadDraft}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
                      >
                        <Download className="h-4 w-4" />
                        Export TXT
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={draft.content}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, content: event.target.value } : prev))}
                    rows={14}
                    className="mt-4 w-full rounded-3xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                  />
                  <p className="mt-3 text-xs text-slate-500">You can edit the draft directly before exporting or continuing.</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Continue prompt</span>
                    <textarea
                      value={continuePrompt}
                      onChange={(event) => setContinuePrompt(event.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                      placeholder="Ask for the next chapter, a plot twist, a character reaction, or a scene continuation."
                    />
                  </label>

                  <button
                    type="button"
                    onClick={continueStory}
                    disabled={continuing}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {continuing ? <Spinner /> : <PencilLine className="h-4 w-4" />}
                    {continuing ? "Continuing story..." : "Continue with new prompt"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[34rem] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
                <div className="mb-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-cyan-300">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-white">No draft yet</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Fill in the creation form on the left, then generate the first text draft. After that, you can review the content, edit it, and continue the story with a new request.
                </p>
              </div>
            )}

            {continuing && draft ? (
              <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                The backend is generating the next chapter. Please keep this tab open.
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}