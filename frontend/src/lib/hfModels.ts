/** Hugging Face model ids configured in-app (khớp backend routers/projects.py). */

export const HF_TEXT_MODEL_OPTIONS: string[] = [
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "meta-llama/Llama-3.1-70B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "mistralai/Mistral-7B-Instruct-v0.3",
];

/** Text-to-image qua HF Inference — chọn trong dropdown cùng LLM. */
export const HF_IMAGE_MODEL_OPTIONS: string[] = [
  "black-forest-labs/FLUX.1-dev",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "runwayml/stable-diffusion-v1-5",
  "Lykon/DreamShaper",
  "SG161222/Realistic_Vision_V6.0_B1_noVAE",
  "prompthero/openjourney",
];

export const HF_MODEL_GROUPS: { label: string; models: string[] }[] = [
  { label: "Văn bản (LLM)", models: HF_TEXT_MODEL_OPTIONS },
  { label: "Ảnh (Hugging Face Inference)", models: HF_IMAGE_MODEL_OPTIONS },
];

export const ALL_HF_MODEL_IDS: string[] = [
  ...HF_TEXT_MODEL_OPTIONS,
  ...HF_IMAGE_MODEL_OPTIONS,
];

export function isImageModelId(modelId: string): boolean {
  return HF_IMAGE_MODEL_OPTIONS.includes(modelId);
}
