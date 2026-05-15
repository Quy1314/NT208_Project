/** Hugging Face/FPT model ids configured in-app (khớp backend routers/projects.py). */

export const hfTextModelOptions: string[] = [
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "meta-llama/Llama-3.1-70B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "mistralai/Mistral-7B-Instruct-v0.3",
];

/** Text-to-image qua HF Inference — chọn trong dropdown cùng LLM. */
export const hfImageModelOptions: string[] = [
  "black-forest-labs/FLUX.1-dev",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "runwayml/stable-diffusion-v1-5",
  "Lykon/DreamShaper",
  "SG161222/Realistic_Vision_V6.0_B1_noVAE",
  "prompthero/openjourney",
];

/** Text-to-speech qua FPT AI; backend nhận model id này tại routers/projects.py. */
export const audioModelOptions: string[] = [
  "fpt-ai-tts-v5",
];

export const hfModelGroups: { label: string; models: string[] }[] = [
  { label: "Văn bản (LLM)", models: hfTextModelOptions },
  { label: "Ảnh (Hugging Face Inference)", models: hfImageModelOptions },
  { label: "Audio (FPT AI TTS)", models: audioModelOptions },
];

export const allHfModelIds: string[] = [
  ...hfTextModelOptions,
  ...hfImageModelOptions,
  ...audioModelOptions,
];

export function isImageModelId(modelId: string): boolean {
  return hfImageModelOptions.includes(modelId);
}

export function isAudioModelId(modelId: string): boolean {
  return audioModelOptions.includes(modelId);
}
