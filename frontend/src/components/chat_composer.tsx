"use client";

import React from "react";
import { API_BASE_URL } from "@/lib/api";
import { ArrowRight, Loader2 } from "lucide-react";

type Language = "vietnamese" | "english";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ProjectResponse {
  id: string;
  title: string;
  prompt: string;
  content: string;
}

function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  if (!token || token === "undefined" || token === "null") {
    return null;
  }
  return token;
}

export default function ChatComposer() {
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [language, setLanguage] = React.useState<Language>("vietnamese");

  const token = React.useMemo(() => getStoredToken(), []);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Tự cuộn xuống cuối khi messages thay đổi
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Không tìm thấy JWT token. Hãy đăng nhập trước.");
      return;
    }

    if (!input.trim()) {
      setError("Vui lòng nhập tin nhắn.");
      return;
    }

    const userMessage = input.trim();
    setInput("");

    // Thêm tin nhắn người dùng vào chat
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: userMessage }]);

    setLoading(true);

    try {
      let response: ProjectResponse;

      if (!projectId) {
        // Tin đầu tiên: tạo project mới
        const createRes = await fetch(`${API_BASE_URL}/api/projects/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: "New Chat",
            prompt: userMessage,
            language: language,
          }),
        });

        if (!createRes.ok) {
          throw new Error("Lỗi tạo project mới.");
        }

        response = (await createRes.json()) as ProjectResponse;
        setProjectId(response.id);
      } else {
        // Tin tiếp theo: viết tiếp project
        const continueRes = await fetch(
          `${API_BASE_URL}/api/projects/${projectId}/continue`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prompt: userMessage,
              language: language,
            }),
          }
        );

        if (!continueRes.ok) {
          throw new Error("Lỗi tiếp tục chat.");
        }

        response = (await continueRes.json()) as ProjectResponse;
      }

      // Thêm phản hồi AI vào chat
      const aiMsgId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: aiMsgId, role: "assistant", content: response.content },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Lỗi xảy ra khi gửi tin nhắn. Vui lòng thử lại."
      );
      // Xóa tin nhắn người dùng nếu request lỗi
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Khung messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>Bắt đầu cuộc trò chuyện...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {msg.content}
                </p>
              </div>
            </div>
          ))
        )}

        {/* Trạng thái loading */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">AI đang suy nghĩ...</span>
              </div>
            </div>
          </div>
        )}

        {/* Thông báo lỗi */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Thanh nhập liệu */}
      <div className="border-t border-gray-300 bg-white p-4">
        <form onSubmit={handleSendMessage} className="space-y-3">
          {!projectId && (
            <div className="flex gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="language"
                  value="vietnamese"
                  checked={language === "vietnamese"}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="w-4 h-4"
                />
                Tiếng Việt
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="language"
                  value="english"
                  checked={language === "english"}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="w-4 h-4"
                />
                English
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Nhập tin nhắn..."
              rows={3}
              disabled={loading}
              className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg flex items-center justify-center transition-colors"
              title="Gửi (hoặc nhấn Enter)"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
