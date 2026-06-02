import uuid

from story_engine import context_pack


class EmptyQuery:
    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, value):
        return self

    def all(self):
        return []


class EmptyDB:
    def query(self, model):
        return EmptyQuery()


class Scope:
    id = uuid.uuid4()


class CapturingVectorStore:
    def search(self, db, scope_id, query, hf_api_key, top_k=6):
        return [{"text": "secret raw lore content", "score": 0.9, "metadata": {}}]


def test_build_context_messages_logs_timing_metadata_without_raw_content(monkeypatch, caplog):
    caplog.set_level("INFO", logger="story_engine.context_pack")
    monkeypatch.setattr("retrieval.service.ensure_canon_scope", lambda db, project_id: Scope())
    monkeypatch.setattr("retrieval.service.vector_store", CapturingVectorStore())

    messages = context_pack.build_context_messages(
        db=EmptyDB(),
        project_id=uuid.uuid4(),
        system_prompt="System",
        title="Telemetry",
        latest_user_message="Find lore",
        language="english",
        hf_api_key=None,
        n_recent=4,
        top_k=1,
    )

    assert "secret raw lore content" in messages[1]["content"]
    assert "build_context_messages" in caplog.text
    assert "retrieval_ms" in caplog.text
    assert "retrieved_chunks=1" in caplog.text
    assert "secret raw lore content" not in caplog.text


def test_build_context_messages_applies_token_budget_to_rag_before_history(monkeypatch):
    monkeypatch.setattr("retrieval.service.ensure_canon_scope", lambda db, project_id: Scope())
    monkeypatch.setattr(
        "retrieval.service.vector_store",
        type(
            "LongVectorStore",
            (),
            {
                "search": lambda self, db, scope_id, query, hf_api_key, top_k=6: [
                    {"text": "alpha " * 80, "score": 0.9, "metadata": {}},
                    {"text": "beta " * 80, "score": 0.8, "metadata": {}},
                ]
            },
        )(),
    )

    messages = context_pack.build_context_messages(
        db=EmptyDB(),
        project_id=uuid.uuid4(),
        system_prompt="System",
        title="Budget",
        latest_user_message="Continue",
        language="english",
        hf_api_key=None,
        n_recent=4,
        top_k=2,
        max_context_tokens=45,
    )

    assert context_pack.estimate_tokens("\n".join(message["content"] for message in messages)) <= 45
    assert "[truncated for context budget]" in messages[1]["content"]
