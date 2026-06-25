"use client";

import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore, TranslationMode } from "@/store/useWorkspaceStore";
import { hfImageModelOptions } from "@/lib/hf_models";
import { PersonalizeCharacterProfile } from "@/lib/personalize_characters";

interface WorkspaceModalsProps {
  currentPasswordState: {
    value: string;
    setValue: (v: string) => void;
  };
  newPasswordState: {
    value: string;
    setValue: (v: string) => void;
  };
  changingPassword: boolean;
  passwordError: string;
  passwordMessage: string;
  onChangePassword: () => void;
  onAddCharacter: (e: React.FormEvent) => void;
  onSaveVisualVariant: (e: React.FormEvent) => void;
  onAddLocation: (e: React.FormEvent) => void;
  onAutoDiscoverCanon: () => void;
  onExportProject: (format: "md" | "pdf" | "docx", translationMode: TranslationMode) => void;
  personalizeKeyInput: string;
  setPersonalizeKeyInput: (v: string) => void;
  personalizeMessage: string;
  onSavePersonalizeKey: () => void;
  onClearPersonalizeKey: () => void;
  characterProfiles: PersonalizeCharacterProfile[];
  editingCharacterId: string | null;
  characterNameInput: string;
  setCharacterNameInput: (v: string) => void;
  characterAliasesInput: string;
  setCharacterAliasesInput: (v: string) => void;
  characterAppearanceInput: string;
  setCharacterAppearanceInput: (v: string) => void;
  characterPersonalityInput: string;
  setCharacterPersonalityInput: (v: string) => void;
  characterNotesInput: string;
  setCharacterNotesInput: (v: string) => void;
  onSaveCharacterProfile: (e: React.FormEvent) => void;
  onEditCharacterProfile: (profile: PersonalizeCharacterProfile) => void;
  onDeleteCharacterProfile: (id: string) => void;
  onClearCharacterProfileForm: () => void;
}

export default function WorkspaceModals({
  currentPasswordState,
  newPasswordState,
  changingPassword,
  passwordError,
  passwordMessage,
  onChangePassword,
  onAddCharacter,
  onSaveVisualVariant,
  onAddLocation,
  onAutoDiscoverCanon,
  onExportProject,
  personalizeKeyInput,
  setPersonalizeKeyInput,
  personalizeMessage,
  onSavePersonalizeKey,
  onClearPersonalizeKey,
  characterProfiles,
  editingCharacterId,
  characterNameInput,
  setCharacterNameInput,
  characterAliasesInput,
  setCharacterAliasesInput,
  characterAppearanceInput,
  setCharacterAppearanceInput,
  characterPersonalityInput,
  setCharacterPersonalityInput,
  characterNotesInput,
  setCharacterNotesInput,
  onSaveCharacterProfile,
  onEditCharacterProfile,
  onDeleteCharacterProfile,
  onClearCharacterProfileForm,
}: WorkspaceModalsProps) {
  const {
    isDark,
    userProfile,
    selectedProject,
    selectedTeamId,
    teamToken,
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
    exportFormatChoice,
    setExportFormatChoice,
    exportTranslationMode,
    setExportTranslationMode,
    exportingFormat,
    canonCharacters,
    canonLocations,
    isLoadingCanon,
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

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      alert("Đã sao chép vào bộ nhớ tạm.");
    } catch {
      alert("Không thể copy.");
    }
  };

  return (
    <>
      {/* 1. Profile Modal */}
      {isProfileOpen && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
            onClick={() => setIsProfileOpen(false)}
          ></div>

          <div className={`absolute top-0 right-0 w-full sm:w-[420px] h-full shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l ${
            isDark ? "bg-slate-900/90 backdrop-blur-xl border-white/10 text-white shadow-black/60" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center p-6 border-b border-transparent">
              <button
                onClick={() => setIsProfileOpen(false)}
                className="text-[#8c8f99] hover:text-white transition-colors p-1 -ml-1 cursor-pointer"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 flex-1 flex flex-col gap-6 overflow-y-auto pb-10">
              <div>
                <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">ID</label>
                <div className={`w-full rounded-xl px-4 py-3.5 text-[14px] font-medium border ${
                  isDark ? "bg-slate-950/40 border-white/10 text-[#f3f4f6]" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}>
                  {userProfile?.id}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Tên hiển thị</label>
                <div className={`w-full rounded-xl px-4 py-3.5 text-[14px] font-medium border ${
                  isDark ? "bg-slate-950/40 border-white/10 text-[#f3f4f6]" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}>
                  {userProfile?.email.split("@")[0]}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Email</label>
                <div className={`w-full rounded-xl px-4 py-3.5 text-[14px] font-medium border ${
                  isDark ? "bg-slate-950/40 border-white/10 text-[#f3f4f6]" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}>
                  {userProfile?.email}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2.5">Ngày tạo tài khoản</label>
                <div className={`w-full rounded-xl px-4 py-3.5 text-[14px] font-medium border ${
                  isDark ? "bg-slate-950/40 border-white/10 text-[#f3f4f6]" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}>
                  {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleString("vi-VN") : "N/A"}
                </div>
              </div>

              <div className={`border-t pt-4 mt-2 space-y-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <label className="block text-[13px] font-semibold text-[#e5e7eb]">Đổi mật khẩu</label>
                <input
                  type="password"
                  value={currentPasswordState.value}
                  onChange={(e) => currentPasswordState.setValue(e.target.value)}
                  placeholder="Mật khẩu hiện tại"
                  className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border ${
                    isDark 
                      ? "bg-slate-950/40 border-white/10 text-[#f3f4f6] placeholder-slate-500 focus:border-blue-500/50" 
                      : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                  }`}
                />
                <input
                  type="password"
                  value={newPasswordState.value}
                  onChange={(e) => newPasswordState.setValue(e.target.value)}
                  placeholder="Mật khẩu mới (>= 8 ký tự)"
                  className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border ${
                    isDark 
                      ? "bg-slate-950/40 border-white/10 text-[#f3f4f6] placeholder-slate-500 focus:border-blue-500/50" 
                      : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                  }`}
                />
                {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
                {passwordMessage && <p className="text-xs text-emerald-400">{passwordMessage}</p>}
                <button
                  onClick={onChangePassword}
                  disabled={changingPassword}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold px-4 py-2.5 transition-all shadow-md shadow-blue-600/10 cursor-pointer"
                >
                  {changingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 2. Personalize Modal */}
      {isPersonalizeOpen && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
            onClick={() => setIsPersonalizeOpen(false)}
          />
          <div className={`absolute top-0 right-0 w-full sm:w-[420px] h-full shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l ${
            isDark ? "bg-slate-900/90 backdrop-blur-xl border-white/10 text-white shadow-black/60" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div>
                <h3 className="text-white font-semibold">Cá nhân hóa</h3>
                <p className="text-xs text-[#8c8f99] mt-0.5">Hugging Face Inference API</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalizeOpen(false)}
                className="text-[#8c8f99] hover:text-white transition-colors p-1 cursor-pointer"
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
                  className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border font-mono text-sm ${
                    isDark 
                      ? "bg-slate-950/40 border-white/10 text-[#f3f4f6] placeholder-slate-500 focus:border-blue-500/50" 
                      : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                  }`}
                />
              </div>
              {personalizeMessage && <p className="text-xs text-emerald-400">{personalizeMessage}</p>}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={onSavePersonalizeKey}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 transition-all shadow-md shadow-blue-600/10 cursor-pointer"
                >
                  Lưu key (phiên hiện tại)
                </button>
                <button
                  type="button"
                  onClick={onClearPersonalizeKey}
                  className={`w-full rounded-xl border font-semibold px-4 py-2.5 transition-colors cursor-pointer ${
                    isDark ? "border-white/10 text-[#e5e7eb] hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Xóa key
                </button>
              </div>
              <p className="text-[11px] text-[#6b7280] leading-relaxed">
                Model khi sinh nội dung chỉ được chọn trong{" "}
                <strong className="text-[#9ca3af]">dropdown trên thanh chat</strong> (danh sách đã cài đặt). Token HF
                cá nhân chỉ thay key gọi API; không có token thì server dùng key mặc định (nếu có).
              </p>

              <div className={`rounded-xl border p-4 space-y-4 ${isDark ? "border-white/10 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                <div>
                  <p className="text-sm font-semibold text-[#e5e7eb]">Nhân vật dùng lại</p>
                  <p className="text-[11px] text-[#8c8f99] mt-1 leading-relaxed">
                    Lưu nhân vật ở đây. Khi prompt tạo project hoặc viết tiếp nhắc đúng tên/alias, hệ thống tự gửi hồ sơ nhân vật vào context cho AI.
                  </p>
                </div>

                {characterProfiles.length > 0 && (
                  <div className="space-y-2">
                    {characterProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className={`rounded-lg border p-3 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{profile.name}</p>
                            {profile.aliases.length > 0 && (
                              <p className="text-[10px] text-slate-500 truncate">alias: {profile.aliases.join(", ")}</p>
                            )}
                          </div>
                          <div className="flex gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => onEditCharacterProfile(profile)}
                              className="text-blue-300 hover:text-blue-200 cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCharacterProfile(profile.id)}
                              className="text-red-300 hover:text-red-200 cursor-pointer"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                        {(profile.appearance || profile.personality) && (
                          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                            {[profile.appearance, profile.personality].filter(Boolean).join(" • ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={onSaveCharacterProfile} className="space-y-3 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#cdd0d5]">
                      {editingCharacterId ? "Sửa hồ sơ nhân vật" : "Thêm nhân vật"}
                    </p>
                    {editingCharacterId && (
                      <button
                        type="button"
                        onClick={onClearCharacterProfileForm}
                        className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        Hủy sửa
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={characterNameInput}
                    onChange={(e) => setCharacterNameInput(e.target.value)}
                    placeholder="Tên nhân vật, ví dụ: Nhân A"
                    className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border ${
                      isDark
                        ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50"
                        : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                    }`}
                  />
                  <input
                    type="text"
                    value={characterAliasesInput}
                    onChange={(e) => setCharacterAliasesInput(e.target.value)}
                    placeholder="Alias cách nhau bằng dấu phẩy: A, Anna, cô A..."
                    className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border ${
                      isDark
                        ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50"
                        : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                    }`}
                  />
                  <textarea
                    value={characterAppearanceInput}
                    onChange={(e) => setCharacterAppearanceInput(e.target.value)}
                    rows={3}
                    placeholder="Ngoại hình: tóc, mắt, trang phục, dấu hiệu nhận diện..."
                    className={`w-full resize-none rounded-xl px-4 py-3 text-[14px] outline-none border ${
                      isDark
                        ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50"
                        : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                    }`}
                  />
                  <textarea
                    value={characterPersonalityInput}
                    onChange={(e) => setCharacterPersonalityInput(e.target.value)}
                    rows={3}
                    placeholder="Tính cách: lạnh lùng, hài hước, hay nghi ngờ, nói ít..."
                    className={`w-full resize-none rounded-xl px-4 py-3 text-[14px] outline-none border ${
                      isDark
                        ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50"
                        : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                    }`}
                  />
                  <textarea
                    value={characterNotesInput}
                    onChange={(e) => setCharacterNotesInput(e.target.value)}
                    rows={3}
                    placeholder="Ghi chú continuity: quá khứ, quan hệ, mục tiêu, điều cấm thay đổi..."
                    className={`w-full resize-none rounded-xl px-4 py-3 text-[14px] outline-none border ${
                      isDark
                        ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50"
                        : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                    }`}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 transition-all shadow-md shadow-purple-600/10 cursor-pointer"
                  >
                    {editingCharacterId ? "Cập nhật nhân vật" : "Lưu nhân vật"}
                  </button>
                </form>
              </div>

              <div className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                <p className="text-[11px] font-semibold text-[#cdd0d5] mb-2">Model ảnh free gợi ý (Hugging Face)</p>
                <div className="flex flex-wrap gap-1.5">
                  {hfImageModelOptions.map((id) => (
                    <span
                      key={id}
                      className={`rounded-md px-2 py-1 text-[10px] font-mono ${
                        isDark ? "bg-white/5 text-[#d1d5db]" : "bg-slate-100 text-slate-700"
                      }`}
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

      {/* 3. Project Settings Modal */}
      {isProjectSettingsOpen && selectedProject && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
            onClick={() => setIsProjectSettingsOpen(false)}
          />
          <div className={`absolute top-0 right-0 w-full sm:w-[420px] h-full shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l ${
            isDark ? "bg-slate-900/90 backdrop-blur-xl border-white/10 text-white shadow-black/60" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between p-6">
              <h3 className="text-white font-semibold">Cài đặt dự án</h3>
              <button onClick={() => setIsProjectSettingsOpen(false)} className="text-[#8c8f99] hover:text-white cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 space-y-4">
              <div className={`rounded-xl p-3 border ${isDark ? "bg-slate-950/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-xs text-slate-300 mb-1">ID dự án</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white break-all">{selectedProject.id}</p>
                  <button onClick={() => copyText(selectedProject.id)} className="text-xs text-blue-300 hover:text-blue-200 transition-colors cursor-pointer">
                    Sao chép
                  </button>
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${isDark ? "bg-slate-950/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-xs text-slate-300 mb-1">Team ID</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white break-all">{selectedTeamId || "Chưa chọn nhóm"}</p>
                  {selectedTeamId && (
                    <button onClick={() => copyText(selectedTeamId)} className="text-xs text-blue-300 hover:text-blue-200 transition-colors cursor-pointer">
                      Sao chép
                    </button>
                  )}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${isDark ? "bg-slate-950/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-xs text-slate-300 mb-1">Team Token</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white break-all">{teamToken || "Chưa có token (chọn nhóm trước)"}</p>
                  {teamToken && (
                    <button onClick={() => copyText(teamToken)} className="text-xs text-blue-300 hover:text-blue-200 transition-colors cursor-pointer">
                      Sao chép
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 4. Canon Modal */}
      {isCanonModalOpen && selectedProject && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 animate-in fade-in"
            onClick={() => setIsCanonModalOpen(false)}
          />
          <div className={`absolute top-0 right-0 w-full sm:w-[480px] h-full shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l ${
            isDark ? "bg-slate-900/90 backdrop-blur-xl border-white/10 text-white shadow-black/60" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h3 className="font-semibold text-lg text-white">Cấu hình Vũ trụ & Nhân vật</h3>
                <p className="text-xs text-slate-400">Thiết lập thế giới lore và ngoại hình nhân vật nhất quán</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onAutoDiscoverCanon}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/10 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                  title="Quét nội dung đã sinh để tự thêm nhân vật và địa điểm AI tạo ra vào canon"
                >
                  Quét AI
                </button>
                <button onClick={() => setIsCanonModalOpen(false)} className="text-[#8c8f99] hover:text-white transition-colors cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex border-b border-white/5 px-6">
              <button
                onClick={() => {
                  setActiveCanonTab("characters");
                  setSelectedCharForVariant(null);
                }}
                className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeCanonTab === "characters" 
                    ? "border-blue-500 text-blue-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Nhân vật
              </button>
              <button
                onClick={() => setActiveCanonTab("locations")}
                className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeCanonTab === "locations" 
                    ? "border-blue-500 text-blue-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Địa điểm / Bối cảnh
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingCanon ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  <p className="text-sm text-slate-400">Đang tải vũ trụ canon...</p>
                </div>
              ) : activeCanonTab === "characters" ? (
                selectedCharForVariant ? (
                  <form onSubmit={onSaveVisualVariant} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCharForVariant(null)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                      >
                        ← Quay lại
                      </button>
                    </div>
                    <h4 className="font-semibold text-white">Ngoại hình: {selectedCharForVariant.display_name}</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[13px] font-medium text-[#cdd0d5] mb-1.5">
                          Trang phục / Outfit (outfit_summary)
                        </label>
                        <textarea
                          rows={4}
                          value={outfitSummary}
                          onChange={(e) => setOutfitSummary(e.target.value)}
                          placeholder="Ví dụ: Áo khoác da đen bụi bặm, áo thun trắng bó, quần jeans sẫm màu và bốt cao cổ..."
                          className={`w-full rounded-xl px-4 py-3 text-sm outline-none border resize-none ${
                            isDark 
                              ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50" 
                              : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-[#cdd0d5] mb-1.5">
                          Đặc điểm khuôn mặt / Nhận dạng (face_marks)
                        </label>
                        <input
                          type="text"
                          value={faceMarksInput}
                          onChange={(e) => setFaceMarksInput(e.target.value)}
                          placeholder="Ví dụ: Tóc ngắn undercut màu xám bạc, vết sẹo dọc mắt trái..."
                          className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${
                            isDark 
                              ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50" 
                              : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                          }`}
                        />
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                          Đặc điểm ngoại hình này được chèn vào prompt tạo ảnh để giữ nhân vật vẽ ra được nhất quán.
                        </p>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 transition-all shadow-md cursor-pointer"
                        >
                          Lưu ngoại hình
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCharForVariant(null)}
                          className={`px-4 rounded-xl border font-semibold py-2.5 transition-colors cursor-pointer ${
                            isDark ? "border-white/10 text-[#e5e7eb] hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-white text-sm">Danh sách nhân vật</h4>
                      {canonCharacters.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">Chưa có nhân vật nào trong canon.</p>
                      ) : (
                        <div className="grid gap-2">
                          {canonCharacters.map((c) => (
                            <div
                              key={c.id || c.slug}
                              className={`flex items-center justify-between p-3 rounded-xl border ${
                                isDark ? "bg-slate-950/40 border-white/10" : "bg-slate-50 border-slate-200"
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-white">{c.display_name}</p>
                                  {c.auto_discovered && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/10">
                                      AI phát hiện
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono">slug: {c.slug}</p>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedCharForVariant(c);
                                  setOutfitSummary("");
                                  setFaceMarksInput("");
                                }}
                                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                              >
                                Ngoại hình
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <form onSubmit={onAddCharacter} className="space-y-3 border-t border-white/5 pt-5">
                      <h4 className="font-semibold text-white text-sm">Thêm nhân vật mới</h4>
                      <div>
                        <label className="block text-[13px] font-medium text-[#cdd0d5] mb-1.5">Tên hiển thị</label>
                        <input
                          type="text"
                          value={newCharDisplayName}
                          onChange={(e) => setNewCharDisplayName(e.target.value)}
                          placeholder="Ví dụ: Alex Mercer, Elara Vance..."
                          required
                          className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${
                            isDark 
                              ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50" 
                              : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                          }`}
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Slug hệ thống sẽ tự động được sinh từ tên hiển thị (viết thường, không dấu, nối bằng gạch dưới).
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 transition-all shadow-md cursor-pointer"
                      >
                        Tạo nhân vật
                      </button>
                    </form>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Danh sách địa điểm</h4>
                    {canonLocations.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Chưa có địa điểm nào trong canon.</p>
                    ) : (
                      <div className="grid gap-2">
                        {canonLocations.map((L) => (
                          <div
                            key={L.slug}
                            className={`p-3 rounded-xl border ${
                              isDark ? "bg-slate-950/40 border-white/10" : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <p className="text-sm font-semibold text-white">{L.display_name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">slug: {L.slug}</p>
                            {L.env_style_tags && L.env_style_tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {L.env_style_tags.map((t: string) => (
                                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/10">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form onSubmit={onAddLocation} className="space-y-3 border-t border-white/5 pt-5">
                    <h4 className="font-semibold text-white text-sm">Thêm địa điểm mới</h4>
                    <div>
                      <label className="block text-[13px] font-medium text-[#cdd0d5] mb-1.5">Tên địa điểm</label>
                      <input
                        type="text"
                        value={newLocDisplayName}
                        onChange={(e) => setNewLocDisplayName(e.target.value)}
                        placeholder="Ví dụ: Rừng Chạng Vạng, Thành phố Neo-Seoul..."
                        required
                        className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${
                          isDark 
                            ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50" 
                            : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#cdd0d5] mb-1.5">
                        Tags phong cách bối cảnh (cách nhau bởi dấu phẩy)
                      </label>
                      <input
                        type="text"
                        value={newLocEnvTags}
                        onChange={(e) => setNewLocEnvTags(e.target.value)}
                        placeholder="Ví dụ: u ám, sương mù, cổ kính..."
                        className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${
                          isDark 
                            ? "bg-slate-950/40 border-white/10 text-white placeholder-slate-600 focus:border-blue-500/50" 
                            : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                        }`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 transition-all shadow-md cursor-pointer"
                    >
                      Tạo địa điểm
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 5. Export Modal */}
      {isExportPanelOpen && selectedProject && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] z-40 animate-in fade-in"
            onClick={() => exportingFormat === null && setIsExportPanelOpen(false)}
          />
          <div className={`absolute top-0 right-0 w-full sm:w-[420px] h-full shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l ${
            isDark ? "bg-slate-900/90 backdrop-blur-xl border-white/10 text-white shadow-black/60" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? "border-white/10" : "border-[#32353d]"}`}>
              <div>
                <h3 className="text-white font-semibold">Xuất dự án</h3>
                <p className="text-xs text-[#8c8f99] mt-0.5">Tùy chọn file và dịch nội dung trước khi tải</p>
              </div>
              <button
                type="button"
                onClick={() => setIsExportPanelOpen(false)}
                disabled={exportingFormat !== null}
                className="text-[#8c8f99] hover:text-white transition-colors p-1 disabled:opacity-50 cursor-pointer"
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
                  className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border focus:outline-none ${
                    isDark 
                      ? "bg-slate-950/40 border-white/10 text-white" 
                      : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  <option value="md" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Markdown (.md)</option>
                  <option value="docx" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Word (.docx)</option>
                  <option value="pdf" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>PDF (.pdf)</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#cdd0d5] mb-2">
                  Dịch nội dung trước khi xuất (google-t5/t5-base)
                </label>
                <select
                  value={exportTranslationMode}
                  onChange={(e) => setExportTranslationMode(e.target.value as TranslationMode)}
                  disabled={exportingFormat !== null}
                  className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none border focus:outline-none ${
                    isDark 
                      ? "bg-slate-950/40 border-white/10 text-white" 
                      : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  <option value="none" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Không dịch</option>
                  <option value="vi-to-en" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Tiếng Việt → Tiếng Anh</option>
                  <option value="en-to-vi" className={isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-700"}>Tiếng Anh → Tiếng Việt</option>
                </select>
                <p className="mt-2 text-[11px] text-[#6b7280] leading-relaxed">
                  Nếu bạn đã lưu HF token trong Cá nhân hóa thì request dịch sẽ dùng token đó.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onExportProject(exportFormatChoice, exportTranslationMode)}
                disabled={exportingFormat !== null}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 transition-all shadow-md shadow-blue-600/10 cursor-pointer disabled:opacity-60"
              >
                {exportingFormat !== null ? "Đang xử lý..." : "Bắt đầu xuất file"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
