"use client";

import React from "react";
import { Mic, Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ModelGroup = { label: string; models: string[] };

export interface WorkspaceComposerDockProps {
  isVisible: boolean;
  selectedProject: { id: string; title: string; prompt: string; content: string } | null;
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
  isVideoModel: boolean;
  onSubmit: () => void;
  personalHfKeyActive: boolean;
  isDark: boolean;
  attachedFile: File | null;
  isRecording: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearAttachedFile: () => void;
  toggleSpeechRecognition: () => void;
  minWords: number;
  setMinWords: (v: number) => void;
  maxWords: number;
  setMaxWords: (v: number) => void;
  lengthOption: string;
  setLengthOption: (v: string) => void;
  queueLength: number;
  onOptimizePrompt?: () => void;
  isOptimizing?: boolean;
}

export default function WorkspaceComposerDock({
  isVisible,
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
  isVideoModel,
  onSubmit,
  personalHfKeyActive,
  isDark,
  attachedFile,
  isRecording,
  fileInputRef,
  handleFileChange,
  clearAttachedFile,
  toggleSpeechRecognition,
  minWords,
  setMinWords,
  maxWords,
  setMaxWords,
  lengthOption,
  setLengthOption,
  queueLength,
  onOptimizePrompt,
  isOptimizing = false,
}: WorkspaceComposerDockProps) {
  if (!isVisible) return null;

  const isVideo = isVideoModel;
  const isBusy = isVideo ? isGeneratingVideo : selectedProject ? isContinuing : isGenerating;
  const safeModel = allModelIds.includes(modelName) ? modelName : allModelIds[0];
  const isTextModel = !isAudioModel && !isImageModel && !isVideo;

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
          : "Mô tả câu chuyện, nhân vật và cốt truyện của bạn...";

  const primaryLabel = isVideo
    ? "Tạo video"
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
          : "Tạo nội dung";

  const busyLabel = isVideo
    ? "Đang tạo video..."
    : selectedProject
      ? isImageModel
        ? "Đang tạo ảnh..."
        : isAudioModel
          ? "Đang tạo audio..."
          : queueLength > 0
            ? `Đang viết tiếp... (Hàng đợi: ${queueLength})`
            : "Đang viết tiếp..."
      : isImageModel
        ? "Đang tạo ảnh..."
        : isAudioModel
          ? "Đang tạo audio..."
          : "Đang tạo nội dung...";

  return (
    <div className="flex-none w-full max-w-4xl mx-auto px-2 sm:px-0 pb-6 pt-2 z-30">
      <div className={`p-3 flex flex-col gap-2 rounded-3xl transition-all border shadow-lg ${
        isDark 
          ? "bg-slate-900/40 backdrop-blur-xl border-white/10 text-white shadow-black/45" 
          : "bg-white border-slate-200 shadow-slate-200/50"
      }`}>
        <Textarea
          data-testid="workspace-composer-input"
          value={selectedProject ? continuePrompt : prompt}
          onChange={(e) => (selectedProject ? setContinuePrompt(e.target.value) : setPrompt(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isBusy || (selectedProject && isTextModel && continuePrompt.trim())) {
                onSubmit();
              }
            }
          }}
          placeholder={placeholderText}
          className={`w-full max-h-32 min-h-[60px] p-3 border-0 shadow-none focus-visible:ring-0 resize-none bg-transparent font-medium ${
            isDark ? "text-[#f3f4f6] placeholder-[#6b7280]" : "text-slate-900 placeholder-slate-400"
          }`}
        />

        {attachedFile && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold w-max border ${
              isDark ? "bg-slate-950/60 border-white/10 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
            }`}>
              <span>📄 {attachedFile.name} ({Math.round(attachedFile.size / 1024)} KB)</span>
              <button 
                type="button"
                onClick={clearAttachedFile} 
                className="font-bold ml-1 transition-colors hover:text-red-500 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleFileChange} 
          accept=".txt,.md,.json,.csv,.js,.ts,.py,.html,.css,.xml" 
        />

        <div className={`flex items-center justify-between pt-2 px-2 border-t mt-1 ${
          isDark ? "border-white/10" : "border-slate-200/50"
        }`}>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <select
              value={safeModel}
              onChange={(e) => setModelName(e.target.value)}
              title="Model Hugging Face (LLM hoặc text-to-image)"
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg max-w-[min(100%,20rem)] font-mono truncate border focus:outline-none ${
                isDark 
                  ? "bg-slate-950/40 border-white/10 text-white" 
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              {modelGroups.map((g) => (
                <optgroup key={g.label} label={g.label} className={isDark ? "bg-slate-900 text-slate-300 font-semibold" : "bg-white text-slate-700 font-semibold"}>
                  {g.models.map((id) => (
                    <option key={id} value={id} className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>
                      {id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!isVideo && !isImageModel && !isAudioModel && (
              <>
                <select
                  value={creativity}
                  onChange={(e) => setCreativity(e.target.value)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none ${
                    isDark
                      ? "bg-slate-950/40 border-white/10 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <option className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Focused</option>
                  <option className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Balanced</option>
                  <option className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Creative</option>
                </select>

                <div className="flex items-center gap-2">
                  {lengthOption !== "custom" ? (
                    <div className={`flex items-center gap-2 border rounded-lg px-3 py-1 ${
                      isDark ? "bg-slate-950/40 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}>
                      <span className="text-[11px] font-medium text-slate-400">Độ dài:</span>
                      <input
                        type="range"
                        min="1000"
                        max="3000"
                        step="1000"
                        value={lengthOption}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLengthOption(val);
                          if (val === "1000") {
                            setMinWords(800);
                            setMaxWords(1200);
                          } else if (val === "2000") {
                            setMinWords(1800);
                            setMaxWords(2200);
                          } else if (val === "3000") {
                            setMinWords(2800);
                            setMaxWords(3200);
                          }
                        }}
                        className="w-20 h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 transition-all focus:outline-none"
                        title="Trượt để chọn độ dài: 1000, 2000, hoặc 3000 từ"
                      />
                      <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 whitespace-nowrap min-w-[50px] text-center">
                        ~{lengthOption} từ
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setLengthOption("custom");
                        }}
                        className={`text-[11px] font-semibold transition-colors cursor-pointer border-l pl-2 ${
                          isDark ? "text-indigo-400 hover:text-indigo-300 border-white/10" : "text-indigo-600 hover:text-indigo-500 border-slate-200"
                        }`}
                        title="Tự tùy chỉnh số từ tối thiểu và tối đa"
                      >
                        Tự chỉnh
                      </button>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${
                      isDark ? "bg-slate-950/40 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}>
                      <input
                        type="number"
                        value={minWords}
                        onChange={(e) => setMinWords(Math.max(1, parseInt(e.target.value) || 0))}
                        placeholder="Min"
                        title="Số từ tối thiểu"
                        className={`w-14 text-center text-xs font-semibold px-1 py-0.5 rounded border focus:outline-none ${
                          isDark
                            ? "bg-slate-900 border-white/10 text-white focus:border-indigo-500"
                            : "bg-white border-slate-200 text-slate-700 focus:border-indigo-500"
                        }`}
                      />
                      <span className="text-[10px] text-slate-400">đến</span>
                      <input
                        type="number"
                        value={maxWords}
                        onChange={(e) => setMaxWords(Math.max(1, parseInt(e.target.value) || 0))}
                        placeholder="Max"
                        title="Số từ tối đa"
                        className={`w-14 text-center text-xs font-semibold px-1 py-0.5 rounded border focus:outline-none ${
                          isDark
                            ? "bg-slate-900 border-white/10 text-white focus:border-indigo-500"
                            : "bg-white border-slate-200 text-slate-700 focus:border-indigo-500"
                        }`}
                      />
                      <span className="text-[11px] text-slate-400">từ</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLengthOption("1000");
                          setMinWords(800);
                          setMaxWords(1200);
                        }}
                        className={`text-[11px] font-semibold transition-colors cursor-pointer border-l pl-2 ml-1 ${
                          isDark ? "text-indigo-400 hover:text-indigo-300 border-white/10" : "text-indigo-600 hover:text-indigo-500 border-slate-200"
                        }`}
                        title="Quay lại dùng thanh trượt mẫu"
                      >
                        Thanh trượt
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "vietnamese" | "english")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none ${
                isDark
                  ? "bg-slate-950/40 border-white/10 text-white"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <option value="vietnamese" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>vietnamese</option>
              <option value="english" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>english</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button 
              type="button"
              variant="ghost" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              className={`text-[#a1a1aa] gap-1 cursor-pointer ${
                isDark ? "hover:text-white hover:bg-white/5" : "hover:text-slate-800 hover:bg-slate-200"
              }`}
            >
              <Paperclip size={14} /> {attachedFile ? "Đã đính kèm" : "Đính kèm"}
            </Button>
            <Button 
              type="button"
              variant="ghost" 
              size="sm" 
              onClick={toggleSpeechRecognition}
              className={`gap-1 cursor-pointer transition-all ${
                isRecording 
                  ? "text-red-500 hover:text-red-400 bg-red-500/10 animate-pulse font-bold" 
                  : `text-[#a1a1aa] ${isDark ? "hover:text-white hover:bg-white/5" : "hover:text-slate-800 hover:bg-slate-200"}`
              }`}
            >
              <Mic size={14} /> {isRecording ? "Đang ghi âm..." : "Giọng nói"}
            </Button>
            
            {isTextModel && onOptimizePrompt && (
              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={onOptimizePrompt}
                disabled={isOptimizing || isBusy || (selectedProject ? !continuePrompt.trim() : !prompt.trim())}
                className={`gap-1 cursor-pointer transition-all ${
                  isDark ? "hover:text-white hover:bg-white/5 text-indigo-400" : "hover:text-indigo-700 hover:bg-slate-200 text-indigo-600"
                }`}
              >
                {isOptimizing ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                ) : (
                  <Sparkles size={14} className="text-indigo-500" />
                )}
                {isOptimizing ? "Đang tối ưu..." : "Tối ưu prompt"}
              </Button>
            )}

            <Button
              data-testid="workspace-submit-button"
              onClick={onSubmit}
              disabled={isBusy && (!selectedProject || !isTextModel || !continuePrompt.trim())}
              className={`ml-2 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer ${
                isBusy && (!selectedProject || !isTextModel || !continuePrompt.trim())
                  ? "bg-indigo-500/50 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:shadow-lg"
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
          Đang dùng Hugging Face token cá nhân (Cá nhân hóa).
        </p>
      )}
      <div className="text-center mt-3 text-[10px] text-slate-400 font-medium font-sans">
        AI có thể hiển thị thông tin chưa chính xác, vui lòng kiểm tra lại phản hồi.
      </div>
    </div>
  );
}
