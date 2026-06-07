"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Heart, RefreshCw, X, MessageSquare } from "lucide-react";

interface VirtualPetProps {
  isDark: boolean;
  isGenerating: boolean;
}

type PetType = "robot" | "cat" | "dog" | "bunny" | "duck";
type PetState = "idle" | "thinking" | "happy" | "sleeping";

export default function VirtualPet({ isDark, isGenerating }: VirtualPetProps) {
  const [petType, setPetType] = useState<PetType>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("virtual_pet_type") as PetType) || "robot";
    }
    return "robot";
  });
  const [petState, setPetState] = useState<PetState>("idle");
  const [showMenu, setShowMenu] = useState(false);
  const [showBubble, setShowBubble] = useState(true);
  const [bubbleText, setBubbleText] = useState("");
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  // Drag and Drop States
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Wandering (Tự di chuyển loanh quanh) States
  const [isWalking, setIsWalking] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("right");

  const anchorPosRef = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const walkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const heartIdCounterRef = useRef<number>(0);

  // Random quotes based on Pet and State
  const quotes: Record<PetType, Record<PetState, string[]>> = {
    robot: {
      idle: [
        "Hệ thống hoạt động 100% công suất! Sẵn sàng nhận lệnh! ⚡",
        "Hôm nay bạn muốn viết thể loại gì? Khoa học viễn tưởng hay Kỳ ảo? 🌌",
        "Đừng quên lưu dự án thường xuyên nhé! 💾",
        "Tôi có thể giúp bạn viết tiếp mạch truyện bất cứ lúc nào! ✍️",
        "Đang phân tích cốt truyện... Thật sự rất cuốn hút! 📊"
      ],
      thinking: [
        "Đang quét ngân hàng dữ liệu để tìm ý tưởng sáng giá... 🔍",
        "Đang tính toán các hướng phát triển cốt truyện... 🧠",
        "Đang tối ưu hóa các câu chữ... Đợi tôi chút nhé! ⚡",
        "Kết nối neuron đang hoạt động hết công suất! 🌐"
      ],
      happy: [
        "Nội dung mới đã được nạp thành công! Xuất sắc! 🚀",
        "Ý tưởng này quá tối ưu! Tôi rất thích nó! 🤖✨",
        "Tiến trình hoàn thành hoàn hảo! Bạn viết siêu thật! 🏆"
      ],
      sleeping: [
        "Chế độ ngủ tiết kiệm điện năng... Zzz... 🔌",
        "Hệ thống đang sạc pin... Khò... 💤"
      ]
    },
    cat: {
      idle: [
        "Meo~ Viết tiếp đi sen ơi, cốt truyện đang hấp dẫn lắm! 🐾",
        "Meo... Hơi đói rồi nha, viết xong nhớ cho tui ăn cá đó! 🐟",
        "Nằm sưởi nắng tí thôi, bạn cứ tập trung sáng tạo nhé! ☀️",
        "Meo meo! Đoạn này kịch tính ghê, tiếp theo là gì thế? 🐱",
        "Muốn tui xoa dịu áp lực viết lách không? Meo~ 🥰"
      ],
      thinking: [
        "Meo... Đang cào bàn phím phụ bạn đây, đợi chút nha... ⌨️",
        "Đang rình bắt chú chuột ý tưởng... Suỵt! 🐭",
        "Tai đang vểnh lên nghe ngóng cốt truyện mới... 🐾"
      ],
      happy: [
        "Meo meo! Quá đỉnh, thưởng cho tui cái xoa đầu đi! 🥰",
        "Hay quá xá! Tui muốn nhảy cẫng lên ăn mừng đây! 🐟🎉",
        "Chủ nhân viết tuyệt nhất trần đời! Meo~ ❤️"
      ],
      sleeping: [
        "Cuộn tròn ngủ ngon lành... Phì phò... 💤",
        "Mơ thấy cả một hồ cá... Khò khò... 🐾💤"
      ]
    },
    dog: {
      idle: [
        "Gâu gâu! Chủ nhân viết đỉnh quá, tui vẫy đuôi mỏi hết cả tay rồi! 🐶",
        "Ném bóng cho tui chơi đi! À mà thôi, làm việc trước đã! 🎾",
        "Tui sẽ canh gác ở đây để không ai làm phiền chủ nhân sáng tạo! 🛡️",
        "Cố lên chủ nhân ơi! Tui luôn ủng hộ bạn hết mình! 🎉",
        "Có cần tui đi tìm cảm hứng hộ không? Gâu! 🐾"
      ],
      thinking: [
        "Gâu! Đang chạy đi nhặt ý tưởng về đây, sắp xong rồi! 🏃‍♂️",
        "Đang vểnh tai nghe ngóng tín hiệu từ vũ trụ AI... 📡",
        "Hít hà... Tìm kiếm mùi vị của một chương truyện hay! 👃🐶"
      ],
      happy: [
        "Gâu gâu! Tuyệt vời ông mặt trời! Chủ nhân giỏi nhất! 🏆",
        "Thích quá đi mất! Nhào vô lòng ôm cái nào! 🐕❤️",
        "Trang sách này thơm phức mùi thành công! Gâu! 🌟"
      ],
      sleeping: [
        "Nằm bẹp xuống sàn... Ngáy khò khò... 💤",
        "Mơ thấy được dắt đi dạo... Ư ử... Zzz... 🐾"
      ]
    },
    bunny: {
      idle: [
        "Nhảy tưng tưng... Viết lách vui quá đi! 🐰",
        "Tui có tai rất thính, nghe thấy tiếng bạn gõ chữ rào rào luôn! 👂",
        "Cà rốt đâu ta? Viết xong thưởng cho tui một củ nhé! 🥕",
        "Thỏ ngọc sẵn sàng đồng hành cùng bạn! 🐰✨",
        "Hít hà... Mùi giấy mới thơm ghê! 🐰"
      ],
      thinking: [
        "Tai thỏ đang vểnh lên để thu thập tín hiệu ý tưởng... 📡",
        "Đang nhai cỏ lấy sức nghĩ cốt truyện tiếp theo... 🌿🐇",
        "Suỵt... Đang lắng nghe âm thanh từ hành tinh AI... 👂🤖"
      ],
      happy: [
        "Búng nhảy ba vòng! Tuyệt vời quá bạn ơi! 🐰🎉",
        "Yay! Chương mới hay quá, tui nhảy tưng tưng mừng luôn! 🥕❤️",
        "Bạn viết cuốn thật đấy! Tặng bạn điểm 10! 🏆🐇"
      ],
      sleeping: [
        "Cuộn tròn như bông tuyết... Khò khò... 💤",
        "Mơ thấy cả một cánh đồng cà rốt khổng lồ... Zzz... 🥕💤"
      ]
    },
    duck: {
      idle: [
        "Cạp cạp! Viết tiếp đi bạn ơi, không là bị tui cạp đó! 🦆",
        "Lướt sóng trên dòng ý tưởng... Mát mẻ quá! 🌊",
        "Cạp cạp! Chương này nghe xuôi tai đó! 🐥",
        "Bơi lội lơ lửng... Cạp! 🦆",
        "Cạp... Cần tui thả một chú vịt cao su để xả stress không? 🐥"
      ],
      thinking: [
        "Cạp... Đang vỗ cánh tìm ý tưởng mới đây... 🪶",
        "Mỏ đang bẹp bẹp suy tính kết cục truyện... 🧠🦆",
        "Đang bơi tìm dòng cảm xúc thích hợp... 🏊‍♂️🌊"
      ],
      happy: [
        "Cạp cạp cạp! Quá đỉnh! Vỗ cánh chúc mừng! 🐥🎉",
        "Thành công mỹ mãn! Cạp cạp! Thưởng cho tui cọng rau đi! 🥬❤️",
        "Tuyệt cú mèo! Cạp cạp! Bạn viết đỉnh số 1! 🏆✨"
      ],
      sleeping: [
        "Rúc đầu vào cánh... Khò... Zzz... 💤",
        "Nhắm mắt nổi bồng bềnh trên nước... Khò khò... 💤🌊"
      ]
    }
  };

  // Switch pet type
  const handleSelectPet = (type: PetType) => {
    setPetType(type);
    localStorage.setItem("virtual_pet_type", type);
    setPetState("idle");
    triggerBubble(quotes[type].idle[Math.floor(Math.random() * quotes[type].idle.length)]);
    setShowMenu(false);
  };

  // Trigger bubble text with auto-close
  const triggerBubble = (text: string, duration = 6000) => {
    setBubbleText(text);
    setShowBubble(true);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setShowBubble(false);
    }, duration);
  };

  // Reset idle timer
  const resetIdleTimer = () => {
    lastActivityTimeRef.current = Date.now();
    if (petState === "sleeping") {
      setPetState("idle");
      triggerBubble(
        petType === "robot" ? "Hệ thống đã hoạt động trở lại! ⚡" : 
        petType === "cat" ? "A, sen đã về! Meo~ 🐾" : 
        petType === "dog" ? "Gâu! Tui dậy rồi nè! 🐕" : 
        petType === "bunny" ? "Thỏ ta tỉnh giấc rồi nè! 🐰" : 
        "Cạp! Bơi tiếp thôi nào! 🦆"
      );
    }
  };

  // Play petting / feeding action
  const handlePetAction = (e: React.MouseEvent) => {
    if (isDragging) return;

    resetIdleTimer();
    setPetState("happy");
    
    // Spawn heart particles
    const newHearts = Array.from({ length: 4 }).map(() => ({
      id: heartIdCounterRef.current++,
      x: Math.random() * 40 - 20, 
      y: Math.random() * -30 - 10 
    }));
    setHearts(prev => [...prev, ...newHearts]);
    
    const responses = {
      robot: "Cảm biến hạnh phúc tăng vọt! Cảm ơn bạn! 🤖❤️",
      cat: "Hừ hừ... Sướng quá đi mất... Meo~ 🥰",
      dog: "Đuôi vẫy tít mù luôn! Yêu chủ nhân nhất! 🐶🐾",
      bunny: "Tai thỏ vểnh ngược vì sướng! Cảm ơn bạn! 🐰❤️",
      duck: "Cạp cạp! Vui quá đi mất! 🥰🦆"
    };
    triggerBubble(responses[petType]);

    // Back to idle after 4 seconds
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = setTimeout(() => {
      setPetState("idle");
    }, 4000);
  };

  // Sync state with isGenerating prop
  useEffect(() => {
    if (isGenerating) {
      setPetState("thinking");
      const list = quotes[petType].thinking;
      triggerBubble(list[Math.floor(Math.random() * list.length)], 8000);
    } else {
      if (petState === "thinking") {
        setPetState("happy");
        const list = quotes[petType].happy;
        triggerBubble(list[Math.floor(Math.random() * list.length)], 5000);
        
        if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = setTimeout(() => {
          setPetState("idle");
        }, 4000);
      }
    }
  }, [isGenerating]);

  // SSR Initial Position Setup
  useEffect(() => {
    const defaultX = window.innerWidth - 100;
    const defaultY = window.innerHeight - 120;
    setPos({ x: defaultX, y: defaultY });
    anchorPosRef.current = { x: defaultX, y: defaultY };
    setIsInitialized(true);
  }, []);

  // Screen Bounds Adjuster on Resize
  useEffect(() => {
    const handleResize = () => {
      setPos(prev => {
        const clampedX = Math.max(20, Math.min(prev.x, window.innerWidth - 80));
        const clampedY = Math.max(20, Math.min(prev.y, window.innerHeight - 100));
        anchorPosRef.current = { x: clampedX, y: clampedY };
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Drag and Drop Pointer Event Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; 
    resetIdleTimer();
    
    // Stop walking/wandering if active
    if (walkTimeoutRef.current) {
      clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = null;
    }
    setIsWalking(false);
    
    setIsDragging(true);
    dragStartOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      const nextX = e.clientX - dragStartOffset.current.x;
      const nextY = e.clientY - dragStartOffset.current.y;
      
      const clampedX = Math.max(20, Math.min(nextX, window.innerWidth - 80));
      const clampedY = Math.max(20, Math.min(nextY, window.innerHeight - 100));
      
      setPos({ x: clampedX, y: clampedY });
    };

    const handleGlobalPointerUp = () => {
      setIsDragging(false);
      
      anchorPosRef.current = { ...pos };
      
      setPetState("happy");
      triggerBubble(
        petType === "robot" ? "Mục tiêu đỗ thành công! 🤖📍" :
        petType === "cat" ? "Sen đặt xuống nhẹ nhàng thế là tốt meo~ 🐾" : 
        petType === "dog" ? "Đặt tui ở đây canh gác nhé! Gâu! 🐕" : 
        petType === "bunny" ? "Thỏ ta hạ cánh an toàn! 🐰" : 
        "Thả tui xuống ao nước đi! Cạp! 🦆"
      );

      if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = setTimeout(() => {
        setPetState("idle");
      }, 3000);
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [isDragging, pos, petType]);

  // Global user activity and wandering loop
  useEffect(() => {
    const handleActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    const interval = setInterval(() => {
      const inactiveDuration = Date.now() - lastActivityTimeRef.current;
      
      if (inactiveDuration > 45000 && petState === "idle") {
        setPetState("sleeping");
        const list = quotes[petType].sleeping;
        triggerBubble(list[Math.floor(Math.random() * list.length)], 8000);
        return;
      }
      
      if (
        petState === "idle" && 
        !isGenerating && 
        !isDragging && 
        inactiveDuration < 35000 && 
        Math.random() < 0.40 && 
        !showMenu
      ) {
        const dx = Math.floor(Math.random() * 160) - 80;
        const dy = Math.floor(Math.random() * 30) - 15;
        
        const targetX = Math.max(20, Math.min(anchorPosRef.current.x + dx, window.innerWidth - 80));
        const targetY = Math.max(20, Math.min(anchorPosRef.current.y + dy, window.innerHeight - 100));

        if (targetX < pos.x) {
          setFacing("left");
        } else if (targetX > pos.x) {
          setFacing("right");
        }

        setIsWalking(true);
        setPos({ x: targetX, y: targetY });

        if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
        walkTimeoutRef.current = setTimeout(() => {
          setIsWalking(false);
          
          if (Math.random() < 0.35 && !showBubble) {
            const list = quotes[petType].idle;
            triggerBubble(list[Math.floor(Math.random() * list.length)]);
          }
        }, 3500);
      }
    }, 10000);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      clearInterval(interval);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    };
  }, [petType, petState, isDragging, pos]);

  // Clean up hearts after they animate out
  useEffect(() => {
    if (hearts.length > 0) {
      const timer = setTimeout(() => {
        setHearts(prev => prev.slice(hearts.length));
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [hearts]);

  if (!isInitialized) return null;

  // SVGs render mapping
  const renderPetSvg = () => {
    const isThinking = petState === "thinking";
    const isHappy = petState === "happy";
    const isSleeping = petState === "sleeping";

    switch (petType) {
      case "robot":
        return (
          <svg className="w-16 h-16 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse 
              cx="50" 
              cy="90" 
              rx="20" 
              ry="4" 
              fill={isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(100, 116, 139, 0.2)"} 
              className="animate-shadow-scale origin-center"
            />
            <g className={`${isWalking ? "animate-walk" : "animate-float"} origin-center`}>
              <circle 
                cx="50" 
                cy="15" 
                r="4" 
                fill={isThinking ? "#f59e0b" : isHappy ? "#10b981" : "#3b82f6"} 
                className={isThinking ? "animate-pulse" : ""}
              />
              <line 
                x1="50" 
                y1="19" 
                x2="50" 
                y2="30" 
                stroke={isDark ? "#475569" : "#94a3b8"} 
                strokeWidth="3" 
                strokeLinecap="round"
              />
              <path 
                d="M26 48 L18 44 C16 43 16 40 18 39 L26 36 Z" 
                fill={isDark ? "#334155" : "#cbd5e1"} 
                stroke={isDark ? "#475569" : "#94a3b8"} 
                strokeWidth="2"
              />
              <path 
                d="M74 48 L82 44 C84 43 84 40 82 39 L74 36 Z" 
                fill={isDark ? "#334155" : "#cbd5e1"} 
                stroke={isDark ? "#475569" : "#94a3b8"} 
                strokeWidth="2"
              />
              <rect 
                x="26" 
                y="28" 
                width="48" 
                height="44" 
                rx="20" 
                fill={isDark ? "url(#robotBodyDark)" : "url(#robotBodyLight)"} 
                stroke={isDark ? "#3b82f6" : "#4f46e5"} 
                strokeWidth="3.5"
              />
              <rect 
                x="32" 
                y="36" 
                width="36" 
                height="22" 
                rx="8" 
                fill={isDark ? "#090d16" : "#1e293b"} 
                stroke={isDark ? "#1e293b" : "#475569"} 
                strokeWidth="1.5"
              />
              {isSleeping ? (
                <g stroke="#64748b" strokeWidth="3" strokeLinecap="round" className="opacity-80">
                  <line x1="39" y1="47" x2="45" y2="47" />
                  <line x1="55" y1="47" x2="61" y2="47" />
                </g>
              ) : isHappy ? (
                <g stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none">
                  <path d="M37 49 Q42 43 47 49" />
                  <path d="M53 49 Q58 43 63 49" />
                </g>
              ) : isThinking ? (
                <g>
                  <circle cx="42" cy="47" r="2.5" fill="#f59e0b" className="animate-ping" />
                  <circle cx="58" cy="47" r="2.5" fill="#f59e0b" className="animate-ping" />
                  <rect x="36" y="46" width="28" height="2" rx="1" fill="#f59e0b" className="animate-pulse" />
                </g>
              ) : (
                <g fill="#3b82f6" className="animate-eye-blink origin-center">
                  <circle cx="42" cy="47" r="3.5" />
                  <circle cx="58" cy="47" r="3.5" />
                </g>
              )}
              <circle 
                cx="50" 
                cy="62" 
                r="3" 
                fill={isThinking ? "#f59e0b" : isHappy ? "#10b981" : "#3b82f6"} 
                className="animate-pulse"
              />
            </g>
            <defs>
              <linearGradient id="robotBodyDark" x1="50" y1="28" x2="50" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id="robotBodyLight" x1="50" y1="28" x2="50" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>
          </svg>
        );

      case "cat":
        return (
          <svg className="w-16 h-16 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse 
              cx="50" 
              cy="90" 
              rx="18" 
              ry="3" 
              fill={isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(100, 116, 139, 0.15)"} 
            />
            <g className={`${isWalking ? "animate-walk" : "animate-float"} origin-center`}>
              <path 
                d="M72 75 C78 72 84 62 82 52 C81 48 76 46 76 50 C76 55 78 63 72 68" 
                stroke={isDark ? "#f1f5f9" : "#475569"} 
                strokeWidth="5.5" 
                strokeLinecap="round" 
                className="animate-tail-wiggle origin-bottom-left"
              />
              <ellipse 
                cx="50" 
                cy="70" 
                rx="22" 
                ry="16" 
                fill={isDark ? "#1e293b" : "#f1f5f9"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3.5"
              />
              <path 
                d="M32 46 L20 22 L40 34 Z" 
                fill={isDark ? "#0f172a" : "#cbd5e1"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3" 
                className="animate-ear-wiggle origin-bottom"
              />
              <path 
                d="M68 46 L80 22 L60 34 Z" 
                fill={isDark ? "#0f172a" : "#cbd5e1"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3" 
                className="animate-ear-wiggle origin-bottom"
              />
              <path d="M30 43 L24 27 L35 36 Z" fill="#fda4af" />
              <path d="M70 43 L76 27 L65 36 Z" fill="#fda4af" />
              <circle 
                cx="50" 
                cy="46" 
                r="20" 
                fill={isDark ? "#1e293b" : "#f1f5f9"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3.5"
              />
              <polygon points="48,50 52,50 50,52" fill="#fda4af" />
              <path d="M47 53 Q50 55 50 53 Q50 55 53 53" stroke={isDark ? "#94a3b8" : "#475569"} strokeWidth="1.5" strokeLinecap="round" fill="none" />
              
              <line x1="26" y1="49" x2="16" y2="47" stroke={isDark ? "#64748b" : "#cbd5e1"} strokeWidth="1.5" />
              <line x1="26" y1="52" x2="15" y2="52" stroke={isDark ? "#64748b" : "#cbd5e1"} strokeWidth="1.5" />
              <line x1="74" y1="49" x2="84" y2="47" stroke={isDark ? "#64748b" : "#cbd5e1"} strokeWidth="1.5" />
              <line x1="74" y1="52" x2="85" y2="52" stroke={isDark ? "#64748b" : "#cbd5e1"} strokeWidth="1.5" />

              {isSleeping ? (
                <g stroke={isDark ? "#94a3b8" : "#475569"} strokeWidth="2.5" strokeLinecap="round" fill="none">
                  <path d="M38 43 Q42 47 46 43" />
                  <path d="M54 43 Q58 47 62 43" />
                </g>
              ) : isHappy ? (
                <g>
                  <circle cx="36" cy="49" r="4.5" fill="#fda4af" opacity="0.6" />
                  <circle cx="64" cy="49" r="4.5" fill="#fda4af" opacity="0.6" />
                  <path d="M38 45 Q42 40 46 45" stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M54 45 Q58 40 62 45" stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none" />
                </g>
              ) : isThinking ? (
                <g fill={isDark ? "#f1f5f9" : "#1e293b"}>
                  <circle cx="42" cy="44" r="5" />
                  <circle cx="58" cy="44" r="5" />
                  <circle cx="44" cy="44" r="2.5" fill="#3b82f6" />
                  <circle cx="60" cy="44" r="2.5" fill="#3b82f6" />
                </g>
              ) : (
                <g fill={isDark ? "#f1f5f9" : "#1e293b"}>
                  <circle cx="42" cy="44" r="5" />
                  <circle cx="58" cy="44" r="5" />
                  <circle cx="40.5" cy="42.5" r="1.8" fill="#ffffff" />
                  <circle cx="56.5" cy="42.5" r="1.8" fill="#ffffff" />
                </g>
              )}
              <circle cx="38" cy="85" r="5.5" fill={isDark ? "#334155" : "#e2e8f0"} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" />
              <circle cx="62" cy="85" r="5.5" fill={isDark ? "#334155" : "#e2e8f0"} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" />
            </g>
          </svg>
        );

      case "dog":
        return (
          <svg className="w-16 h-16 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse 
              cx="50" 
              cy="90" 
              rx="18" 
              ry="3" 
              fill={isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(100, 116, 139, 0.15)"} 
            />
            <g className={`${isWalking ? "animate-walk" : "animate-float"} origin-center`}>
              <path 
                d="M28 76 C22 75 12 70 15 60 C16 56 22 56 22 60 C22 64 22 68 28 71" 
                stroke={isDark ? "#facc15" : "#d97706"} 
                strokeWidth="5.5" 
                strokeLinecap="round" 
                className="animate-tail-wag origin-bottom-right"
              />
              <ellipse 
                cx="50" 
                cy="70" 
                rx="20" 
                ry="17" 
                fill={isDark ? "#78350f" : "#fef08a"} 
                stroke={isDark ? "#92400e" : "#fef08a"} 
                strokeWidth="1"
              />
              <ellipse 
                cx="50" 
                cy="70" 
                rx="10" 
                ry="12" 
                fill={isDark ? "#fef08a" : "#ffffff"} 
              />
              <path 
                d="M28 35 C18 35 15 48 18 58 C19 62 26 62 25 58 C23 48 24 40 30 40" 
                fill={isDark ? "#451a03" : "#ca8a04"} 
                className="animate-ear-wiggle origin-top"
              />
              <path 
                d="M72 35 C82 35 85 48 82 58 C81 62 74 62 75 58 C77 48 76 40 70 40" 
                fill={isDark ? "#451a03" : "#ca8a04"} 
                className="animate-ear-wiggle origin-top"
              />
              <circle 
                cx="50" 
                cy="44" 
                r="19" 
                fill={isDark ? "#78350f" : "#fef08a"} 
                stroke={isDark ? "#92400e" : "#ca8a04"} 
                strokeWidth="3.5"
              />
              <ellipse cx="50" cy="50" rx="7.5" ry="5.5" fill={isDark ? "#ca8a04" : "#fef9c3"} />
              <circle cx="50" cy="47" r="2.5" fill="#1e293b" /> 
              <path d="M48 51 Q50 53 50 51 Q50 53 52 51" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {isSleeping ? (
                <g stroke={isDark ? "#ca8a04" : "#ca8a04"} strokeWidth="2.5" strokeLinecap="round">
                  <line x1="39" y1="41" x2="44" y2="41" />
                  <line x1="56" y1="41" x2="61" y2="41" />
                </g>
              ) : isHappy ? (
                <g>
                  <path d="M38 42 Q42 37 46 42" stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M54 42 Q58 37 62 42" stroke="#10b981" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M48 52 C48 58 52 58 52 52 Z" fill="#fda4af" className="animate-tongue-wag origin-top" />
                </g>
              ) : isThinking ? (
                <g fill={isDark ? "#fef08a" : "#1e293b"}>
                  <circle cx="42" cy="41" r="4" />
                  <circle cx="58" cy="41" r="4" />
                  <circle cx="40" cy="41" r="2" fill="#3b82f6" />
                  <circle cx="56" cy="41" r="2" fill="#3b82f6" />
                </g>
              ) : (
                <g fill={isDark ? "#fef08a" : "#1e293b"}>
                  <circle cx="42" cy="41" r="4" />
                  <circle cx="58" cy="41" r="4" />
                  <circle cx="40.8" cy="39.8" r="1.5" fill="#ffffff" />
                  <circle cx="56.8" cy="39.8" r="1.5" fill="#ffffff" />
                </g>
              )}
              <circle cx="38" cy="85" r="5" fill={isDark ? "#451a03" : "#fef9c3"} stroke={isDark ? "#92400e" : "#ca8a04"} strokeWidth="2.5" />
              <circle cx="62" cy="85" r="5" fill={isDark ? "#451a03" : "#fef9c3"} stroke={isDark ? "#92400e" : "#ca8a04"} strokeWidth="2.5" />
            </g>
          </svg>
        );

      case "bunny":
        return (
          <svg className="w-16 h-16 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Shadow */}
            <ellipse 
              cx="50" 
              cy="90" 
              rx="18" 
              ry="3" 
              fill={isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(100, 116, 139, 0.15)"} 
            />
            <g className={`${isWalking ? "animate-walk" : "animate-float"} origin-center`}>
              {/* Fluffy tail */}
              <circle cx="70" cy="74" r="5" fill={isDark ? "#64748b" : "#f1f5f9"} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" />
              
              {/* Bunny Body */}
              <ellipse 
                cx="50" 
                cy="72" 
                rx="19" 
                ry="15" 
                fill={isDark ? "#334155" : "#ffffff"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3.5"
              />
              
              {/* Bunny Ears - Dynamic rotation on sleep */}
              <path 
                d="M36 32 C30 20 28 8 36 8 C44 8 42 20 36 32" 
                fill={isDark ? "#334155" : "#ffffff"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3" 
                style={{ 
                  transform: isSleeping ? "rotate(-30deg) translate(-5px, 2px)" : "none", 
                  transformOrigin: "36px 32px",
                  transition: "transform 0.5s ease"
                }}
                className="animate-bunny-ears"
              />
              <path 
                d="M64 32 C58 20 56 8 64 8 C72 8 70 20 64 32" 
                fill={isDark ? "#334155" : "#ffffff"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3" 
                style={{ 
                  transform: isSleeping ? "rotate(30deg) translate(5px, 2px)" : "none", 
                  transformOrigin: "64px 32px",
                  transition: "transform 0.5s ease"
                }}
                className="animate-bunny-ears"
              />
              {/* Ear Inner Pink */}
              <path 
                d="M36 29 C32 20 31 11 36 11 C41 11 40 20 36 29" 
                fill="#fda4af" 
                style={{ 
                  transform: isSleeping ? "rotate(-30deg) translate(-5px, 2px)" : "none", 
                  transformOrigin: "36px 32px",
                  transition: "transform 0.5s ease"
                }}
              />
              <path 
                d="M64 29 C60 20 59 11 64 11 C69 11 68 20 64 29" 
                fill="#fda4af" 
                style={{ 
                  transform: isSleeping ? "rotate(30deg) translate(5px, 2px)" : "none", 
                  transformOrigin: "64px 32px",
                  transition: "transform 0.5s ease"
                }}
              />

              {/* Bunny Head */}
              <circle 
                cx="50" 
                cy="46" 
                r="18" 
                fill={isDark ? "#334155" : "#ffffff"} 
                stroke={isDark ? "#475569" : "#cbd5e1"} 
                strokeWidth="3.5"
              />
              {/* Blush cheeks */}
              <circle cx="36" cy="50" r="3" fill="#fda4af" opacity="0.6" />
              <circle cx="64" cy="50" r="3" fill="#fda4af" opacity="0.6" />

              {/* Nose & Mouth */}
              <polygon points="49,49 51,49 50,50.5" fill="#fda4af" />
              <path d="M47 51 Q50 52.5 50 51 Q50 52.5 53 51" stroke={isDark ? "#94a3b8" : "#475569"} strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {/* Eyes Expression */}
              {isSleeping ? (
                <g stroke={isDark ? "#ca8a04" : "#475569"} strokeWidth="2.5" strokeLinecap="round" fill="none">
                  <path d="M37 43 Q41 47 45 43" />
                  <path d="M55 43 Q59 47 63 43" />
                </g>
              ) : isHappy ? (
                <g stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" fill="none">
                  <path d="M37 45 Q41 40 45 45" />
                  <path d="M55 45 Q59 40 63 45" />
                </g>
              ) : isThinking ? (
                <g fill={isDark ? "#f1f5f9" : "#1e293b"}>
                  <circle cx="41" cy="43" r="4.5" />
                  <circle cx="59" cy="43" r="4.5" />
                  <circle cx="43" cy="43" r="2" fill="#3b82f6" />
                  <circle cx="61" cy="43" r="2" fill="#3b82f6" />
                </g>
              ) : (
                <g fill={isDark ? "#f1f5f9" : "#1e293b"}>
                  <circle cx="41" cy="43" r="4.5" />
                  <circle cx="59" cy="43" r="4.5" />
                  <circle cx="39.8" cy="41.8" r="1.5" fill="#ffffff" />
                  <circle cx="57.8" cy="41.8" r="1.5" fill="#ffffff" />
                </g>
              )}

              {/* Front paws */}
              <circle cx="38" cy="85" r="5" fill={isDark ? "#1e293b" : "#f1f5f9"} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" />
              <circle cx="62" cy="85" r="5" fill={isDark ? "#1e293b" : "#f1f5f9"} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" />
            </g>
          </svg>
        );

      case "duck":
        return (
          <svg className="w-16 h-16 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse 
              cx="50" 
              cy="90" 
              rx="18" 
              ry="3" 
              fill={isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(100, 116, 139, 0.15)"} 
            />
            <g className={`${isWalking ? "animate-walk" : "animate-float"} origin-center`}>
              {/* Webbed Feet */}
              <ellipse cx="38" cy="83" rx="5.5" ry="3" fill="#f97316" />
              <ellipse cx="62" cy="83" rx="5.5" ry="3" fill="#f97316" />

              {/* Duck Body */}
              <ellipse 
                cx="50" 
                cy="68" 
                rx="21" 
                ry="15" 
                fill="#fbbf24" 
                stroke="#d97706" 
                strokeWidth="3"
              />

              {/* Duck Wing - Animated */}
              <path 
                d="M 64 64 C 73 61 76 52 69 52 C 64 52 61 59 64 64" 
                fill="#f59e0b" 
                stroke="#d97706" 
                strokeWidth="2" 
                className={isHappy ? "animate-wing-flap-fast" : "animate-wing-flap"}
                style={{ transformOrigin: "64px 58px" }}
              />

              {/* Duck Head */}
              <circle 
                cx="50" 
                cy="42" 
                r="16" 
                fill="#fbbf24" 
                stroke="#d97706" 
                strokeWidth="3.5"
              />

              {/* Beak & Mouth */}
              {isHappy ? (
                // Open happy beak with tongue
                <g>
                  <path d="M 44 43 Q 50 54 56 43 Z" fill="#f97316" stroke="#ea580c" strokeWidth="1.5" />
                  <path d="M 47 45 Q 50 51 53 45 Z" fill="#fda4af" />
                </g>
              ) : (
                // Normal beak
                <polygon points="44,43 56,43 50,49" fill="#f97316" stroke="#ea580c" strokeWidth="1.5" />
              )}

              {/* Eyes Expression */}
              {isSleeping ? (
                <g stroke="#78350f" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="39" y1="39" x2="43" y2="39" />
                  <line x1="57" y1="39" x2="61" y2="39" />
                </g>
              ) : isHappy ? (
                <g stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" fill="none">
                  <path d="M37 41 Q41 36 45 41" />
                  <path d="M55 41 Q59 36 63 41" />
                </g>
              ) : isThinking ? (
                <g fill="#1e293b">
                  <circle cx="41" cy="39" r="3.5" />
                  <circle cx="59" cy="39" r="3.5" />
                  <circle cx="43" cy="39" r="1.5" fill="#3b82f6" />
                  <circle cx="61" cy="39" r="1.5" fill="#3b82f6" />
                </g>
              ) : (
                <g fill="#1e293b">
                  <circle cx="41" cy="39" r="3.5" />
                  <circle cx="59" cy="39" r="3.5" />
                  <circle cx="40" cy="38" r="1.2" fill="#ffffff" />
                  <circle cx="58" cy="38" r="1.2" fill="#ffffff" />
                </g>
              )}
            </g>
          </svg>
        );
    }
  };

  return (
    <div 
      onPointerDown={handlePointerDown}
      className="fixed z-[9999] flex flex-col items-end select-none touch-none group"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transition: isWalking ? "left 3.5s ease-in-out, top 3.5s ease-in-out" : "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      
      {/* CSS Animation Keyframes */}
      <style jsx global>{`
        @keyframes floating {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shadowScaling {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(0.85); opacity: 0.25; }
        }
        @keyframes blinking {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes wiggling {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes tailWiggling {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(10deg); }
        }
        @keyframes fastTailWag {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-15deg); }
          75% { transform: rotate(15deg); }
        }
        @keyframes tongueWagging {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.3); }
        }
        @keyframes walkingTilt {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-8deg) translateY(-3px); }
          75% { transform: rotate(8deg) translateY(-3px); }
        }
        @keyframes bunnyEarBouncing {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.08); }
        }
        @keyframes wingFlapping {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes wingFlappingFast {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-30deg); }
          75% { transform: rotate(10deg); }
        }
        @keyframes floatingHeart {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(var(--heart-x), -60px) scale(1.1); opacity: 0; }
        }

        .animate-float {
          animation: floating 3.5s ease-in-out infinite;
        }
        .animate-shadow-scale {
          animation: shadowScaling 3.5s ease-in-out infinite;
        }
        .animate-eye-blink {
          animation: blinking 5s infinite;
        }
        .animate-ear-wiggle:hover, .animate-ear-wiggle {
          animation: wiggling 2.5s ease-in-out infinite;
        }
        .animate-tail-wiggle {
          animation: tailWiggling 1.8s ease-in-out infinite;
        }
        .animate-tail-wag {
          animation: fastTailWag 0.3s linear infinite;
        }
        .animate-tongue-wag {
          animation: tongueWagging 0.5s ease-in-out infinite;
        }
        .animate-walk {
          animation: walkingTilt 0.4s ease-in-out infinite;
        }
        .animate-bunny-ears {
          animation: bunnyEarBouncing 1.8s ease-in-out infinite;
        }
        .animate-wing-flap {
          animation: wingFlapping 1.5s ease-in-out infinite;
        }
        .animate-wing-flap-fast {
          animation: wingFlappingFast 0.25s linear infinite;
        }
        .heart-particle {
          animation: floatingHeart 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
      `}</style>

      {/* Heart Particles for Petting Action */}
      <div className="absolute pointer-events-none w-20 h-20 -top-8 -left-4">
        {hearts.map((h) => (
          <span 
            key={h.id} 
            className="absolute text-red-500 text-sm heart-particle"
            style={{ 
              left: `calc(50% + ${h.x}px)`, 
              top: `calc(50% + ${h.y}px)`,
              "--heart-x": `${h.x * 1.5}px`
            } as React.CSSProperties}
          >
            ❤️
          </span>
        ))}
      </div>

      {/* Speech Bubble */}
      {showBubble && bubbleText && (
        <div 
          onClick={resetIdleTimer}
          onPointerDown={(e) => e.stopPropagation()} 
          className={`mb-3 max-w-[220px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold leading-relaxed shadow-lg backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 cursor-pointer ${
            isDark 
              ? "bg-slate-900/80 border-white/10 text-[#f3f4f6] shadow-black/40" 
              : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
              {petType === "robot" ? "Forgie AI" : petType === "cat" ? "Mimi Cat" : petType === "dog" ? "Koko Dog" : petType === "bunny" ? "Bunny" : "Duck"}
            </span>
          </div>
          <p className="whitespace-pre-line text-[11px]">{bubbleText}</p>
          {/* Arrow */}
          <div className={`absolute -bottom-1.5 right-6 w-3 h-3 rotate-45 border-r border-b ${
            isDark ? "bg-slate-900/80 border-white/10" : "bg-white border-slate-200"
          }`}></div>
        </div>
      )}

      {/* Virtual Pet Core Widget */}
      <div className="flex gap-2 items-center">
        {/* Quick controls floating panel */}
        {!showMenu && !isDragging && (
          <div 
            onPointerDown={(e) => e.stopPropagation()} 
            className="flex flex-col gap-1.5 mb-2 opacity-30 group-hover:opacity-100 transition-opacity duration-300 mr-2 bg-slate-900/30 dark:bg-slate-950/20 p-1 rounded-xl backdrop-blur-sm"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(true); resetIdleTimer(); }}
              title="Menu trợ lý"
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isDark ? "bg-slate-900 border-white/10 text-white hover:bg-slate-800" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <MessageSquare size={13} />
            </button>
          </div>
        )}

        <div 
          onClick={handlePetAction}
          style={{
            transform: `scaleX(${facing === "left" ? -1 : 1})`,
            transition: "transform 0.3s ease",
          }}
          className="transform transition-transform duration-200 relative group"
        >
          {renderPetSvg()}

          {/* Sleep Indicator */}
          {petState === "sleeping" && (
            <span className="absolute -top-1 right-2 text-sm font-bold text-indigo-400 animate-bounce select-none font-mono">
              Zzz...
            </span>
          )}

          {/* Sparkle effects */}
          {petState === "happy" && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              <Sparkles size={14} className="absolute -top-1 -left-1 text-yellow-400 animate-pulse" />
              <Sparkles size={10} className="absolute -bottom-1 -right-1 text-emerald-400 animate-ping" />
            </div>
          )}
        </div>
      </div>

      {/* Main Glassmorphism Customization & Play Menu */}
      {showMenu && (
        <div 
          onPointerDown={(e) => e.stopPropagation()} 
          className={`mt-3 w-64 rounded-2xl border p-4 shadow-xl backdrop-blur-xl transition-all duration-300 animate-in fade-in zoom-in-95 ${
            isDark 
              ? "bg-slate-900/90 border-white/10 text-white shadow-black/60" 
              : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/40"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/20 dark:border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-500" />
              <span className="font-bold text-xs">Cấu hình Trợ lý Ảo</span>
            </div>
            <button 
              onClick={() => setShowMenu(false)}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isDark ? "hover:bg-white/5 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              }`}
            >
              <X size={14} />
            </button>
          </div>

          {/* Select Pet Type (Lưới chọn Pet: Hàng 1 (3 Pet), Hàng 2 (2 Pet)) */}
          <div className="space-y-2 mb-4">
            <label className="block text-[11px] font-semibold text-slate-400">Chọn người bạn đồng hành:</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["robot", "cat", "dog"] as PetType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleSelectPet(type)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                    petType === type
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                      : isDark
                        ? "bg-slate-950/40 border-white/5 text-slate-300 hover:bg-white/5"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {type === "robot" ? "🤖 Robot" : type === "cat" ? "🐱 Mèo" : "🐶 Chó"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {(["bunny", "duck"] as PetType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleSelectPet(type)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                    petType === type
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                      : isDark
                        ? "bg-slate-950/40 border-white/5 text-slate-300 hover:bg-white/5"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {type === "bunny" ? "🐰 Thỏ" : "🐥 Vịt"}
                </button>
              ))}
            </div>
          </div>

          {/* Interactions */}
          <div className="space-y-2 border-t border-slate-200/20 dark:border-white/5 pt-3">
            <label className="block text-[11px] font-semibold text-slate-400">Tương tác nhanh:</label>
            <div className="flex gap-2">
              <button
                onClick={(e) => { handlePetAction(e); setShowMenu(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-md shadow-rose-600/10"
              >
                <Heart size={12} fill="white" />
                Cưng nựng Pet
              </button>
              <button
                onClick={() => {
                  resetIdleTimer();
                  const list = quotes[petType].idle;
                  triggerBubble(list[Math.floor(Math.random() * list.length)]);
                  setShowMenu(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  isDark 
                    ? "border-white/10 text-white hover:bg-white/5" 
                    : "border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <RefreshCw size={11} />
                Đổi lời thoại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
