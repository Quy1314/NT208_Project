"use client";

import Link from "next/link";
import Image from "next/image";
import { LANDING_TEMPLATES } from "@/lib/landingTemplates";
import { useMemo, useState } from "react";

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<"all" | "image" | "video">("all");
  const filteredTemplates = useMemo(() => {
    if (activeCategory === "all") return LANDING_TEMPLATES;
    return LANDING_TEMPLATES.filter((tpl) => tpl.category === activeCategory);
  }, [activeCategory]);

  return (
    <main className="min-h-screen bg-[#040812] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.22),transparent_30%)]" />
      <section className="relative mx-auto max-w-6xl px-6 pb-14 pt-8">
        <header className="sticky top-4 z-40 mb-10 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4 shadow-lg shadow-black/30">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">AI Agent Studio</p>
            <h1 className="mt-1 text-lg font-bold sm:text-xl">Không gian làm việc từ Prompt đến Thiết kế</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Đăng nhập
            </Link>
            <Link href="/register" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Đăng ký
            </Link>
          </div>
        </header>

        <div className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111827] to-[#0b1220] p-8 shadow-2xl shadow-black/30">
            <p className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              Vận hành bởi thư viện prompt + ui-stitch-figma-flow
            </p>
            <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
              Tạo mẫu hình ảnh/video bằng AI, rồi tiếp tục làm ngay trong workspace.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Chọn mẫu prompt từ <code>promt_chung</code>, tạo sample media bằng AI, sau đó bấm
              <span className="font-semibold text-cyan-300"> Làm tương tự </span>
              để đưa prompt vào workspace hiện tại.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/workspace" className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-400">
                Mở workspace
              </Link>
              <Link href="/register" className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
                Tạo tài khoản
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            {[
              "Chuẩn hóa brief từ prompt",
              "Tạo mẫu ảnh/video bằng AI",
              "Tinh chỉnh theo workflow thiết kế",
              "Làm tiếp trong chat workspace",
            ].map((step, i) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold text-cyan-300">BƯỚC {i + 1}</p>
                <p className="mt-1 text-sm text-slate-100">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <section>
          <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-purple-500/15 px-5 py-4 shadow-[0_10px_40px_rgba(34,211,238,0.12)]">
            <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Prompt Gallery - AI Visual Showcase
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Chọn danh mục để xem các mẫu ảnh/video nổi bật và tạo phiên bản tương tự trong workspace.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-end justify-end gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-1">
              {[
                { key: "all", label: "Tất cả" },
                { key: "image", label: "Ảnh" },
                { key: "video", label: "Video" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveCategory(item.key as "all" | "image" | "video")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    activeCategory === item.key ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((tpl) => (
              <article
                key={tpl.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg shadow-black/25 transition hover:-translate-y-1 hover:border-cyan-400/35"
              >
                <div className="relative aspect-video bg-black">
                  {tpl.category === "video" ? (
                    <video
                      src={tpl.previewUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover opacity-90 group-hover:opacity-100"
                    />
                  ) : (
                    <Image
                      src={tpl.previewUrl}
                      alt={tpl.title}
                      width={1280}
                      height={720}
                      className="h-full w-full object-cover opacity-90 group-hover:opacity-100"
                    />
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="line-clamp-1 font-semibold text-white">{tpl.title}</h4>
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-slate-300">{tpl.shortPrompt}</p>
                  <Link
                    href={`/workspace?template=${encodeURIComponent(tpl.id)}`}
                    className="inline-flex rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300"
                  >
                    Làm tương tự
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
