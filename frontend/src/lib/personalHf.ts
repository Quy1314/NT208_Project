/** Hugging Face Inference token tạm — chỉ sessionStorage, không đồng bộ server. */
export const PERSONAL_HF_STORAGE_KEY = "personal_hf_api_key";

export function getPersonalHfApiKey(): string | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(PERSONAL_HF_STORAGE_KEY);
  const t = v?.trim();
  return t ? t : null;
}

export function setPersonalHfApiKey(key: string): void {
  sessionStorage.setItem(PERSONAL_HF_STORAGE_KEY, key.trim());
}

export function clearPersonalHfApiKey(): void {
  sessionStorage.removeItem(PERSONAL_HF_STORAGE_KEY);
}
