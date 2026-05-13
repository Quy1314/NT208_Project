"""Hugging Face feature-extraction embeddings (MiniLM 384-dim)."""

from __future__ import annotations

import os
from typing import Any

import requests

from lore.db_models import LORE_EMBEDDING_DIM

DEFAULT_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def embed_texts(texts: list[str], api_key: str | None, model_id: str | None = None) -> list[list[float]]:
    if not texts:
        return []
    key = (api_key or os.getenv("hf_key_read") or "").strip()
    if not key:
        raise RuntimeError("Missing Hugging Face API key for embeddings (header or hf_key_read).")
    model = (model_id or os.getenv("CANON_EMBEDDING_MODEL") or DEFAULT_EMBED_MODEL).strip()
    url = f"https://router.huggingface.co/hf-inference/models/{model}"
    alt = f"https://api-inference.huggingface.co/models/{model}"
    headers = {"Authorization": f"Bearer {key}"}
    body: dict[str, Any] = {"inputs": texts if len(texts) > 1 else texts[0], "options": {"wait_for_model": True}}

    for endpoint in (url, alt):
        try:
            r = requests.post(endpoint, headers=headers, json=body, timeout=120)
            r.raise_for_status()
            data = r.json()
        except Exception:
            continue
        vectors = _normalize_hf_embedding_response(data, len(texts))
        if vectors and len(vectors[0]) == LORE_EMBEDDING_DIM:
            return vectors
    raise RuntimeError("Embedding API failed for all endpoints.")


def embed_query(text: str, api_key: str | None, model_id: str | None = None) -> list[float]:
    return embed_texts([text], api_key, model_id)[0]


def _normalize_hf_embedding_response(data: Any, n_inputs: int) -> list[list[float]]:
    if data is None:
        return []
    if n_inputs == 1:
        if isinstance(data, list) and data and isinstance(data[0], (int, float)):
            return [[float(x) for x in data]]
        if isinstance(data, list) and data and isinstance(data[0], list):
            return [[float(x) for x in data[0]]]
    if isinstance(data, list) and len(data) == n_inputs:
        out: list[list[float]] = []
        for row in data:
            if isinstance(row, list) and row and isinstance(row[0], (int, float)):
                out.append([float(x) for x in row])
        return out
    return []
