# Kaelen RAG-Augmented Prompts for Context Consistency

This file contains the prompts used to verify context continuity for the new character **Kaelen** (slug: `kaelen`).

## Character Specification (Database Canon)
- **Slug**: `kaelen`
- **Outfit Variant (default)**: `Kaelen is an athletic rogue with a sharp jawline, a scar across his left eye, short spiky silver hair, and amber eyes. He wears a dark leather vest, a grey hooded cloak, and wields dual daggers glowing with green poison.`
- **Visual Bible Style Suffix**: `cinematic fantasy realism, photorealistic rendering style, highly rendered 8k concept art, detailed textures, raytraced reflections, volumetric atmospheric lighting, masterpiece`
- **Visual Bible Trigger Tokens**: `award-winning fantasy illustration, hyper-detailed digital art`
- **Negative Prompt Bank**: `ugly, deformed, blurry, low quality, bad proportions, distorted face, extra limbs, anime style, cartoon, drawing, flat shading, simple background, CGI, plastic texture`

---

## Prompt 1: Shadowy Castle Corridor (Hành lang lâu đài)
- **UI Raw Prompt**: `Kaelen sneaking in the shadowy castle corridors`
- **Compiled Positive Prompt**:
  ```text
  cinematic fantasy realism, photorealistic rendering style, highly rendered 8k concept art, detailed textures, raytraced reflections, volumetric atmospheric lighting, masterpiece, award-winning fantasy illustration, hyper-detailed digital art. Kaelen sneaking in the shadowy castle corridors; character kaelen; outfit variant default; appearance: Kaelen is an athletic rogue with a sharp jawline, a scar across his left eye, short spiky silver hair, and amber eyes. He wears a dark leather vest, a grey hooded cloak, and wields dual daggers glowing with green poison.; emotion determined. medium shot, character-focused composition. cinematic rim light, volumetric haze. mood: epic. environment: shadowy castle corridors, night
  ```

---

## Prompt 2: High Roof Jump (Nhảy từ mái nhà)
- **UI Raw Prompt**: `Kaelen jumping from a high roof at night`
- **Compiled Positive Prompt**:
  ```text
  cinematic fantasy realism, photorealistic rendering style, highly rendered 8k concept art, detailed textures, raytraced reflections, volumetric atmospheric lighting, masterpiece, award-winning fantasy illustration, hyper-detailed digital art. Kaelen jumping from a high roof at night; character kaelen; outfit variant default; appearance: Kaelen is an athletic rogue with a sharp jawline, a scar across his left eye, short spiky silver hair, and amber eyes. He wears a dark leather vest, a grey hooded cloak, and wields dual daggers glowing with green poison.; emotion determined. medium shot, character-focused composition. cinematic rim light, volumetric haze. mood: epic. environment: high roof, night
  ```

---

## Prompt 3: Tavern Table Map Examination (Nghiên cứu bản đồ trong quán rượu)
- **UI Raw Prompt**: `Kaelen sitting at a tavern table under dim candlelight, examining a map`
- **Compiled Positive Prompt**:
  ```text
  cinematic fantasy realism, photorealistic rendering style, highly rendered 8k concept art, detailed textures, raytraced reflections, volumetric atmospheric lighting, masterpiece, award-winning fantasy illustration, hyper-detailed digital art. Kaelen sitting at a tavern table under dim candlelight, examining a map; character kaelen; outfit variant default; appearance: Kaelen is an athletic rogue with a sharp jawline, a scar across his left eye, short spiky silver hair, and amber eyes. He wears a dark leather vest, a grey hooded cloak, and wields dual daggers glowing with green poison.; emotion determined. medium shot, character-focused composition. cinematic rim light, volumetric haze. mood: epic. environment: tavern table, night
  ```
