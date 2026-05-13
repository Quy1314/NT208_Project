# Continuity engine — file manifest

## New

| Path | Purpose |
|------|---------|
| `backend/lore/db_models.py` | ORM: `canon_scope`, `canon_character`, `character_visual_variant`, `creature_instance`, `party_slot`, `canon_location`, `canon_event`, `relationship_edge`, `canon_chapter`, `world_state_kv`, `lore_chunk`, `visual_bible`, `lore_asset` |
| `backend/migrations/002_canon_multimodal_engine.sql` | SQL migration (Postgres) |
| `backend/retrieval/chunker.py` | Text chunking |
| `backend/retrieval/embedder.py` | HF feature-extraction embeddings |
| `backend/retrieval/service.py` | Scope ensure, reindex, semantic search, append segments |
| `backend/services/canon_queries.py` | Structured reads + `format_structured_context_pack` |
| `backend/story_engine/context_pack.py` | `build_story_context_pack` |
| `backend/scene_graph/schemas.py` | Pydantic `SceneGraph`, `DiffusionRecipe`, … |
| `backend/scene_graph/compiler.py` | `compile_scene_graph` |
| `backend/prompt_builder/__init__.py` | `build_diffusion_recipe`, repair strengthen |
| `backend/image_pipeline/hf_render.py` | HF `text_to_image` from recipe |
| `backend/image_pipeline/pipeline.py` | `run_canon_image_pipeline`, `canon_engine_enabled` |
| `backend/validators/continuity.py` | `validate_scene_against_db` |
| `backend/routers/canon.py` | Lore REST API |
| `docs/workflows/text-image-continuity.md` | Workflow diagrams |

## Modified

| Path | Change |
|------|--------|
| `backend/main.py` | `import lore.db_models`; register `canon.router`; dedupe includes |
| `backend/routers/projects.py` | Canon story/image paths; `generate_story_content(..., canon_context_pack=…)`; create project shell-first |
| `requirements.txt` | (pgvector removed; embeddings via HF HTTP only) |
| `docs/runbook.md` | Canon setup, env vars, troubleshooting |

## Phases (implementation)

- **Phase 0:** DB + ORM (`002` + `lore/db_models.py` + `main` import).
- **Phase 1:** Retrieval (`retrieval/*`, reindex API).
- **Phase 2:** Story engine (`context_pack`, `projects` story branch).
- **Phase 3:** Scene graph + prompt builder + HF render (`scene_graph`, `prompt_builder`, `image_pipeline`).
- **Phase 4:** Validator + repair loop (`validators`, `pipeline` retries).
- **Phase 5:** Hardening — Redis queue GPU worker (not in repo yet), observability.
