export interface LandingTemplate {
  id: string;
  title: string;
  category: "image" | "video";
  modelMode: string;
  shortPrompt: string;
  promptText: string;
  previewUrl: string;
}

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: "img-surreal-horse",
    title: "Surreal Glowing Horse",
    category: "image",
    modelMode: "Nano Banana ProImage",
    shortPrompt: "Cinematic surreal horse running indoors at night.",
    promptText:
      "Surreal, cinematic night scene of a majestic horse galloping through an unexpected indoor space, its body glowing with soft radiant light and dramatic high-contrast lighting.",
    previewUrl: "/landing-samples/sample-surreal-horse.png",
  },
  {
    id: "img-subway-editorial",
    title: "Subway Streetwear Editorial",
    category: "image",
    modelMode: "Seedream 4.5Image",
    shortPrompt: "Gen Z fashion subject framed in a subway carriage.",
    promptText:
      "Cinematic streetwear editorial inside an open subway carriage with a bold Gen Z character in the doorway, symmetrical framing, gritty urban texture, and campaign-style fashion lighting.",
    previewUrl: "/landing-samples/sample-subway-editorial.png",
  },
  {
    id: "img-luxury-perfume",
    title: "Luxury Perfume Product Shot",
    category: "image",
    modelMode: "Nano Banana ProImage",
    shortPrompt: "Premium perfume bottle studio shot on marble.",
    promptText:
      "Elegant product photography of a luxury crystal perfume bottle on Carrara marble, dramatic side lighting, deep charcoal gradient background, and high-end commercial style.",
    previewUrl: "/landing-samples/sample-luxury-perfume.png",
  },
  {
    id: "video-horse-beach-sunset",
    title: "Horse Running at Sunset",
    category: "video",
    modelMode: "Veo 3.1Text->Video",
    shortPrompt: "Ultra-cinematic white horse galloping along sunset beach.",
    promptText:
      "A majestic white horse running gracefully along the shoreline during sunset, cinematic tracking shot, realistic water splashes, dramatic golden-orange sky, and 4K film look.",
    previewUrl: "/landing-samples/Majestic_Horse_Sunset_Video_Generation.mp4",
  },
  {
    id: "video-antarctic-penguin",
    title: "Penguin Polar Journey",
    category: "video",
    modelMode: "Veo 3.1 FastText->Video",
    shortPrompt: "Low-angle penguin tracking shot in Antarctic snowfield.",
    promptText:
      "A single emperor penguin walking away across Antarctic snowfield, low-angle camera tracking, realistic footprints, dramatic overcast sky and distant snow mountain.",
    previewUrl: "/landing-samples/Penguin_Video_Generation.mp4",
  },
  {
    id: "video-neon-tokyo-fpv",
    title: "Neon Tokyo FPV Rush",
    category: "video",
    modelMode: "Kling 3.0 ProText->Video",
    shortPrompt: "FPV drone sequence through rainy neon Tokyo streets.",
    promptText:
      "Cinematic FPV drone racing through neon-lit Tokyo streets at night in rain, sharp turns, volumetric fog, billboards, and sci-fi city atmosphere.",
    previewUrl: "/landing-samples/FPV_Drone_Racing_in_Neon_Tokyo.mp4",
  },
];

export function getTemplatePromptById(id: string | null): string | null {
  if (!id) return null;
  const matched = LANDING_TEMPLATES.find((item) => item.id === id);
  return matched?.promptText ?? null;
}
