/** Hugging Face Inference token tạm — chỉ sessionStorage, không đồng bộ server. */
export const personalHfStorageKey = "personal_hf_api_key";

export function getPersonalHfApiKey(): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(personalHfStorageKey);
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

export function setPersonalHfApiKey(key: string): void {
  sessionStorage.setItem(personalHfStorageKey, key.trim());
}

export function clearPersonalHfApiKey(): void {
  sessionStorage.removeItem(personalHfStorageKey);
}
