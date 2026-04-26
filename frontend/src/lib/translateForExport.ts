import { getPersonalHfApiKey } from "@/lib/personalHf";
import { API_BASE_URL } from "@/lib/api";

export type TranslationMode = "none" | "vi-to-en" | "en-to-vi";

interface ExportTranslationInput {
  title: string;
  prompt: string;
  content: string;
}

interface ExportTranslationOutput {
  title: string;
  prompt: string;
  content: string;
}

export async function translateProjectForExport(
  data: ExportTranslationInput,
  mode: TranslationMode
): Promise<ExportTranslationOutput> {
  if (mode === "none") return data;

  const accessToken =
    (typeof window !== "undefined" && (localStorage.getItem("access_token") || sessionStorage.getItem("access_token"))) ||
    "";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken && accessToken !== "undefined" && accessToken !== "null") {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const personalHfKey = getPersonalHfApiKey();
  if (personalHfKey) {
    headers["X-HF-Api-Key"] = personalHfKey;
  }

  const res = await fetch(`${API_BASE_URL}/api/projects/translate-export`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...data, mode }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (payload && typeof payload.detail === "string" && payload.detail) ||
      `Translation request failed (HTTP ${res.status}).`;
    throw new Error(detail);
  }

  return {
    title: typeof payload?.title === "string" ? payload.title : data.title,
    prompt: typeof payload?.prompt === "string" ? payload.prompt : data.prompt,
    content: typeof payload?.content === "string" ? payload.content : data.content,
  };
}
