"""Render DiffusionRecipe qua Hugging Face Inference text-to-image."""

from __future__ import annotations

import base64
import io

from huggingface_hub import InferenceClient
from PIL import Image as PILImage

from scene_graph.schemas import DiffusionRecipe


def render_recipe_to_data_url(recipe: DiffusionRecipe, hf_api_key: str) -> str:
    client = InferenceClient(token=hf_api_key)
    kwargs = dict(
        prompt=recipe.positive,
        negative_prompt=recipe.negative or None,
        model=recipe.model_id,
        guidance_scale=recipe.guidance_scale,
        num_inference_steps=recipe.num_inference_steps,
    )
    if recipe.seed is not None:
        kwargs["seed"] = recipe.seed

    image = client.text_to_image(**kwargs)

    buf = io.BytesIO()
    if isinstance(image, PILImage.Image):
        image.save(buf, format="PNG")
    else:
        buf.write(bytes(image))
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"
