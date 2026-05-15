"use client";

import { Mic, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Project = {
  id: string;
  title: string;
  prompt: string;
  content: string;
};

export type ModelGroup = { label: string; models: string[] };

type ComposerBarProps = {
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
  onSubmit: () => void;
  personalHfKeyActive: boolean;
};

export default function ComposerBar({
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
  onSubmit,
  personalHfKeyActive,
}: ComposerBarProps) {
  if (!isVisible) return null;

  const isBusy = selectedProject ? isContinuing : isGenerating;
  const safeModel = allModelIds.includes(modelName) ? modelName : allModelIds[0];

  const placeholderText = selectedProject
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

  const primaryLabel = selectedProject
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

  const busyLabel = selectedProject
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
            {!isImageModel && !isAudioModel && (
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

          <div className="flex items-center gap-2">
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
