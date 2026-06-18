/** Hugging Face/VieNeu model ids configured in-app (khớp backend routers/projects.py). */

export const hfTextModelOptions: string[] = [
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
  "mistralai/Mistral-Nemo-Instruct-2407",
];

/** Text-to-image qua HF Inference — chọn trong dropdown cùng LLM. */
export const hfImageModelOptions: string[] = [
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-xl-base-1.0",
];

/** Text-to-speech qua VieNeu-TTS v3 Turbo (voice cloning, local model). */
export const audioModelOptions: string[] = [
  "vieneu-tts-v3",
];

export const videoModelOptions: string[] = [
  "fal-video",
  "kling-video",
];

export const hfModelGroups: { label: string; models: string[] }[] = [
  { label: "Văn bản (LLM)", models: hfTextModelOptions },
  { label: "Ảnh (Hugging Face Inference)", models: hfImageModelOptions },
  { label: "Audio (VieNeu TTS)", models: audioModelOptions },
  { label: "Video", models: videoModelOptions },
];

export const allHfModelIds: string[] = [
  ...hfTextModelOptions,
  ...hfImageModelOptions,
  ...audioModelOptions,
  ...videoModelOptions,
];

export function isImageModelId(modelId: string): boolean {
  return hfImageModelOptions.includes(modelId);
}

export function isAudioModelId(modelId: string): boolean {
  return audioModelOptions.includes(modelId);
}

export function isVideoModelId(modelId: string): boolean {
  return videoModelOptions.includes(modelId);
}
