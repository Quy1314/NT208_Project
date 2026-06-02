import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from retrieval.chunker import chunk_text_rag
from story_engine import context_pack


@dataclass
class FakeContextEntry:
    project_id: uuid.UUID
    prompt: str
    generated_content: str
    created_at: datetime


class FakeQuery:
    def __init__(self, rows):
        self.rows = list(rows)
        self._limit = None

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        self.rows = sorted(self.rows, key=lambda row: row.created_at, reverse=True)
        return self

    def limit(self, value):
        self._limit = value
        return self

    def all(self):
        rows = self.rows
        if self._limit is not None:
            rows = rows[: self._limit]
        return rows


class FakeDB:
    def __init__(self, context_entries):
        self.context_entries = context_entries

    def query(self, model):
        return FakeQuery(self.context_entries)


class FakeScope:
    def __init__(self):
        self.id = uuid.uuid4()


class FakeVectorStore:
    def search(self, db, scope_id, query, hf_api_key, top_k=6):
        return [
            {
                "text": "Astra carries a silver compass from the first chapter.",
                "score": 0.91,
                "metadata": {"character_names": ["Astra"]},
            },
            {
                "text": "The city of Lumen forbids open fire after sunset.",
                "score": 0.84,
                "metadata": {"location": "Lumen"},
            },
        ][:top_k]


def test_chunk_text_rag_uses_large_chunks_with_overlap():
    text = "0123456789" * 700

    chunks = chunk_text_rag(text, max_chars=3000, overlap=400)

    assert len(chunks) == 3
    assert all(len(chunk) <= 3000 for chunk in chunks)
    assert chunks[1].startswith(text[2600:2610])
    assert chunks[2].startswith(text[5200:5210])


def test_build_context_messages_combines_system_rag_recent_window_and_latest_user(monkeypatch):
    project_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    entries = [
        FakeContextEntry(project_id, f"prompt {i}", f"content {i}", now + timedelta(seconds=i))
        for i in range(5)
    ]
    db = FakeDB(entries)

    monkeypatch.setattr("retrieval.service.ensure_canon_scope", lambda db, project_id: FakeScope())
    monkeypatch.setattr("retrieval.service.vector_store", FakeVectorStore())

    messages = context_pack.build_context_messages(
        db=db,
        project_id=project_id,
        system_prompt="You are a careful storyteller.",
        title="Lumen Archive",
        latest_user_message="Continue with Astra entering Lumen.",
        language="vietnamese",
        hf_api_key=None,
        n_recent=4,
        top_k=2,
        canon_context_pack="Astra: brave cartographer",
    )

    assert messages[0] == {"role": "system", "content": "You are a careful storyteller."}
    assert "Structured Universe Lore & Bible" in messages[1]["content"]
    assert "Astra: brave cartographer" in messages[1]["content"]
    assert "Relevant long-term context" in messages[2]["content"]
    assert "silver compass" in messages[2]["content"]
    assert "Lumen forbids open fire" in messages[2]["content"]

    recent_roles_and_content = [(msg["role"], msg["content"]) for msg in messages[3:-1]]
    assert recent_roles_and_content == [
        ("user", "prompt 3"),
        ("assistant", "content 3"),
        ("user", "prompt 4"),
        ("assistant", "content 4"),
    ]

    assert messages[-1]["role"] == "user"
    assert "Hãy viết tiếp" in messages[-1]["content"]
    assert "Tiêu đề: Lumen Archive" in messages[-1]["content"]
    assert "Yêu cầu hiện tại: Continue with Astra entering Lumen." in messages[-1]["content"]
    assert "Chỉ dùng tiếng Việt" in messages[-1]["content"]


def test_build_context_messages_falls_back_when_vector_search_fails(monkeypatch):
    class FailingVectorStore:
        def search(self, db, scope_id, query, hf_api_key, top_k=6):
            raise RuntimeError("embedding service down")

    monkeypatch.setattr("retrieval.service.ensure_canon_scope", lambda db, project_id: FakeScope())
    monkeypatch.setattr("retrieval.service.vector_store", FailingVectorStore())

    messages = context_pack.build_context_messages(
        db=FakeDB([]),
        project_id=uuid.uuid4(),
        system_prompt="System",
        title="Fallback",
        latest_user_message="Next scene",
        language="english",
        hf_api_key=None,
        n_recent=4,
        top_k=2,
    )

    assert messages[1]["content"] == "Relevant long-term context:\n(none)"
    assert messages[-1]["content"].startswith("Write the next part of this story in english.")
