import uuid
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from database import Base
import models
from lore.db_models import CanonScope, LoreChunk
from story_engine import context_pack


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


class DeterministicVectorStore:
    def search(self, db, scope_id, query, hf_api_key, top_k=6):
        rows = (
            db.query(LoreChunk)
            .filter(LoreChunk.scope_id == scope_id)
            .order_by(LoreChunk.chunk_index.asc())
            .limit(top_k)
            .all()
        )
        return [
            {"text": row.text, "score": 1.0 - index * 0.1, "metadata": row.entity_ids}
            for index, row in enumerate(rows)
        ]


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            models.User.__table__,
            models.Project.__table__,
            models.ProjectContextEntry.__table__,
            CanonScope.__table__,
            LoreChunk.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


def test_build_context_messages_uses_real_db_history_and_lore_chunks(db_session, monkeypatch):
    monkeypatch.setattr("retrieval.service.vector_store", DeterministicVectorStore())
    user_id = uuid.uuid4()
    project_id = uuid.uuid4()
    user = models.User(id=user_id, email="owner@example.test", password_hash="hash")
    project = models.Project(id=project_id, user_id=user_id, title="Lumen", prompt="Seed", content="")
    db_session.add_all([user, project])
    db_session.commit()
    db_session.refresh(project)

    scope = CanonScope(project_id=project.id)
    db_session.add(scope)
    db_session.commit()
    db_session.refresh(scope)

    now = datetime.now(UTC)
    db_session.add_all(
        [
            models.ProjectContextEntry(
                project_id=project.id,
                prompt=f"prompt {index}",
                generated_content=f"content {index}",
                created_at=now + timedelta(seconds=index),
            )
            for index in range(4)
        ]
        + [
            LoreChunk(
                scope_id=scope.id,
                chunk_index=0,
                text="Astra keeps the silver compass hidden under her cloak.",
                entity_ids={"source": "test"},
                source="test",
            ),
            LoreChunk(
                scope_id=scope.id,
                chunk_index=1,
                text="Lumen gates close when the violet bell rings.",
                entity_ids={"source": "test"},
                source="test",
            ),
        ]
    )
    db_session.commit()

    messages = context_pack.build_context_messages(
        db=db_session,
        project_id=project.id,
        system_prompt="System prompt",
        title="Lumen",
        latest_user_message="Continue at the gate",
        language="english",
        hf_api_key=None,
        n_recent=4,
        top_k=2,
    )

    assert "silver compass" in messages[1]["content"]
    assert "violet bell" in messages[1]["content"]
    assert [(msg["role"], msg["content"]) for msg in messages[2:-1]] == [
        ("user", "prompt 2"),
        ("assistant", "content 2"),
        ("user", "prompt 3"),
        ("assistant", "content 3"),
    ]
    assert messages[-1]["content"].startswith("Write the next part of this story in english.")
