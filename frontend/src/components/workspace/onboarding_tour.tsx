"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TourStep {
  title: string;
  content: string;
  selector?: string;
  icon?: string;
  placement?: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    title: "Chào mừng đến với Trợ lý AI!",
    content: "Hệ thống giúp bạn sáng tác truyện, tạo ảnh, âm thanh (audio) và video bằng AI. Hãy cùng khám phá nhanh các tính năng trong không gian làm việc nhé!",
    icon: "👋"
  },
  {
    title: "Quản lý Dự án & Nhóm",
    content: "Nơi hiển thị các dự án gần đây của bạn và quản lý các không gian làm việc nhóm.",
    selector: '[data-tour="tour-sidebar"]',
    icon: "📁",
    placement: "right"
  },
  {
    title: "Tạo dự án mới",
    content: "Nhấp vào nút này bất cứ lúc nào bạn muốn tạo một dự án sáng tạo mới hoàn toàn.",
    selector: '[data-tour="tour-new-project-button"]',
    icon: "➕",
    placement: "right"
  },
  {
    title: "Khung soạn thảo",
    content: "Nhập ý tưởng, tóm tắt cốt truyện hoặc mô tả video tại đây. Nhấn Enter hoặc click Sáng tạo để bắt đầu.",
    selector: '[data-testid="workspace-composer-input"]',
    icon: "✍️",
    placement: "top"
  },
  {
    title: "Bắt đầu sáng tạo",
    content: "Nhấn nút này để bắt đầu gửi yêu cầu và tiến hành tạo nội dung (truyện, ảnh, audio hoặc video) bằng AI.",
    selector: '[data-testid="workspace-submit-button"]',
    icon: "🚀",
    placement: "top"
  },
  {
    title: "Lựa chọn Mô hình AI",
    content: "Lựa chọn mô hình AI phù hợp cho tác vụ: Viết truyện (LLM), Tạo ảnh, Tạo audio hoặc Tạo video.",
    selector: 'select[title="Model Hugging Face (LLM hoặc text-to-image)"]',
    icon: "🤖",
    placement: "top"
  },
  {
    title: "Tối ưu Prompt nâng cao",
    content: "Bấm nút này để AI tự động tối ưu hóa và viết chi tiết hơn prompt của bạn trước khi gửi, giúp kết quả hoàn hảo hơn.",
    selector: '[data-tour="tour-optimize-button"]',
    icon: "✨",
    placement: "top"
  },
  {
    title: "Thú cưng ảo đồng hành",
    content: "Chú pet dễ thương đồng hành cùng bạn, phản hồi sinh động mỗi khi AI đang tạo nội dung hoặc khi bạn tương tác cưng nựng.",
    selector: '[data-tour="tour-virtual-pet"]',
    icon: "🦄",
    placement: "left"
  }
];

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export default function OnboardingTour({ isOpen, onClose, isDark }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const updateRect = () => {
      const step = STEPS[currentStep];
      if (step && step.selector) {
        const el = document.querySelector(step.selector);
        if (el) {
          const r = el.getBoundingClientRect();
          // Check if element is visible/has dimensions
          if (r.width > 0 && r.height > 0) {
            setRect({
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom
            });
            return;
          }
        }
      }
      setRect(null);
    };

    updateRect();
    
    // Add event listeners to keep spotlight aligned
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, { capture: true });

    // Polling fallback to capture layout updates (e.g. state loading)
    const interval = setInterval(updateRect, 200);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, { capture: true });
      clearInterval(interval);
    };
  }, [currentStep, isOpen]);

  // Restart step when tour re-opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeStep = STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("workspace_tour_seen", "true");
    onClose();
  };

  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: `${rect.top - 6}px`,
        left: `${rect.left - 6}px`,
        width: `${rect.width + 12}px`,
        height: `${rect.height + 12}px`,
        boxShadow: "0 0 0 9999px rgba(4, 8, 18, 0.75)",
        borderRadius: "16px",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "none",
        zIndex: 99998,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        width: "0px",
        height: "0px",
        boxShadow: "0 0 0 9999px rgba(4, 8, 18, 0.75)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "none",
        zIndex: 99998,
      };

  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 99999,
        maxWidth: "420px",
        width: "90%",
      };
    }

    const tooltipWidth = 360;
    const tooltipHeight = 180; // Estimated height for sizing clamp
    const margin = 20;
    const placement = activeStep.placement || "bottom";

    let top = 0;
    let left = 0;

    if (placement === "bottom") {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === "top") {
      top = rect.top - tooltipHeight - margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === "right") {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + margin;
    } else if (placement === "left") {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - margin;
    }

    // Keep within viewport safety margins
    const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
    const screenHeight = typeof window !== "undefined" ? window.innerHeight : 768;

    if (left < margin) left = margin;
    if (left + tooltipWidth > screenWidth - margin) {
      left = screenWidth - tooltipWidth - margin;
    }
    if (top < margin) top = margin;
    if (top + tooltipHeight > screenHeight - margin) {
      top = screenHeight - tooltipHeight - margin;
    }

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      zIndex: 99999,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  };

  const renderArrow = () => {
    if (!rect) return null;
    const placement = activeStep.placement || "bottom";

    let arrowClass = "";
    let arrowStyle: React.CSSProperties = {};

    if (placement === "bottom") {
      arrowClass = "bottom-full left-1/2 -translate-x-1/2 text-white dark:text-slate-900";
      arrowStyle = {
        borderWidth: "10px",
        borderStyle: "solid",
        borderColor: "transparent transparent currentColor transparent",
      };
    } else if (placement === "top") {
      arrowClass = "top-full left-1/2 -translate-x-1/2 text-white dark:text-slate-900";
      arrowStyle = {
        borderWidth: "10px",
        borderStyle: "solid",
        borderColor: "currentColor transparent transparent transparent",
      };
    } else if (placement === "right") {
      arrowClass = "right-full top-1/2 -translate-y-1/2 text-white dark:text-slate-900";
      arrowStyle = {
        borderWidth: "10px",
        borderStyle: "solid",
        borderColor: "transparent currentColor transparent transparent",
      };
    } else if (placement === "left") {
      arrowClass = "left-full top-1/2 -translate-y-1/2 text-white dark:text-slate-900";
      arrowStyle = {
        borderWidth: "10px",
        borderStyle: "solid",
        borderColor: "transparent transparent transparent currentColor",
      };
    }

    return <div className={`absolute ${arrowClass} pointer-events-none drop-shadow-sm`} style={arrowStyle} />;
  };

  return (
    <>
      {/* Spotlight highlight element */}
      <div style={spotlightStyle} />

      {/* Screen click block overlay */}
      <div 
        className="fixed inset-0 pointer-events-auto bg-transparent z-[99990]"
        onClick={(e) => {
          // Block accidental clicks on the page, but let clicks on the tooltip propagate
          e.stopPropagation();
        }}
      />

      {/* Tooltip dialog card */}
      <div
        style={getTooltipStyle()}
        className={`p-6 rounded-2xl border shadow-2xl animate-in fade-in duration-300 ${
          isDark
            ? "bg-slate-900/95 border-white/10 text-white shadow-black/80 backdrop-blur-xl"
            : "bg-white border-slate-100 text-slate-900 shadow-slate-300/50"
        }`}
      >
        {renderArrow()}

        {/* Close Button */}
        <button
          onClick={handleComplete}
          className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${
            isDark ? "text-slate-400 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
          }`}
          title="Đóng hướng dẫn"
        >
          <X size={16} />
        </button>

        {/* Card Header (Title & Icon) */}
        <div className="flex items-center gap-3 mb-3 pr-6">
          {activeStep.icon && (
            <span className="text-2xl select-none" role="img" aria-label="step-icon">
              {activeStep.icon}
            </span>
          )}
          <h3 className="font-bold text-base leading-snug">
            {activeStep.title}
          </h3>
        </div>

        {/* Card Body (Content) */}
        <p className={`text-sm leading-relaxed mb-6 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
          {activeStep.content}
        </p>

        {/* Card Footer (Progress & Navigation) */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {currentStep + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className={`text-xs font-bold gap-1 rounded-xl h-9 px-3.5 transition-all ${
                  isDark
                    ? "border-white/10 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <ChevronLeft size={14} />
                Quay lại
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs font-bold gap-1 rounded-xl h-9 px-4 text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              {currentStep === STEPS.length - 1 ? "Hoàn thành" : "Tiếp theo"}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
