from sqlalchemy import Column, String, Text, ForeignKey, TIMESTAMP, Boolean, Integer, Float, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_remember = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    # Map thuộc tính Python user_id sang cột DB owner_id để tương thích ngược.
    user_id = Column("owner_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    prompt = Column(Text, nullable=False)
    content = Column(Text, nullable=False, server_default="")
    rolling_summary = Column(Text, nullable=True)
    story_bible = Column(Text, nullable=True)
    outline = Column(Text, nullable=True)
    min_words = Column(Integer, nullable=True, default=1000, server_default="1000")
    max_words = Column(Integer, nullable=True, default=2000, server_default="2000")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    context_entries = relationship("ProjectContextEntry", back_populates="project")
    chapters = relationship("Chapter", back_populates="project", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")
    word_count = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    generation_time = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="chapters")

    __table_args__ = (
        UniqueConstraint("project_id", "chapter_number", name="uq_project_chapter_number"),
        Index("ix_chapters_project_status", "project_id", "status"),
    )




class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    used_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

class ProjectContextEntry(Base):
    __tablename__ = "project_context_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    language = Column(String(20), nullable=False, server_default="vietnamese")
    generated_content = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="context_entries")


class TeamWorkspace(Base):
    __tablename__ = "team_workspaces"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_workspace_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    team_id = Column(UUID(as_uuid=True), ForeignKey("team_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    joined_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class ProjectTeamToken(Base):
    __tablename__ = "project_team_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("team_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class AudioFile(Base):
    __tablename__ = "audio_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    audio_url = Column(Text, nullable=False) 
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class AudioJob(Base):
    __tablename__ = "audio_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    language = Column(String(20), nullable=False, server_default="vietnamese")
    status = Column(String(20), nullable=False, server_default="queued", index=True)
    result_path = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("team_workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(120), nullable=False)
    content_type = Column(String(30), nullable=False, default="novel", server_default="novel")
    template_text = Column(Text, nullable=False)
    is_public = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())


# ==========================================
# SCHEMA PYDANTIC cho validate dữ liệu.
# ==========================================
from typing import Literal
from pydantic import BaseModel

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TeamCreateReq(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: str
    name: str

class ProjectCreateReq(BaseModel):
    title: str
    prompt: str
    language: Literal["vietnamese", "english"] = "vietnamese"
    model_name: str | None = None  # Hugging Face Inference model id (optional)
    min_words: int | None = 1000
    max_words: int | None = 2000

class ProjectContinueReq(BaseModel):
    prompt: str
    language: Literal["vietnamese", "english"] = "vietnamese"
    model_name: str | None = None
    min_words: int | None = 1000
    max_words: int | None = 2000

class TitleGenerateReq(BaseModel):
    prompt: str
    language: Literal["vietnamese", "english"] = "vietnamese"

class ProjectResponse(BaseModel):
    id: str
    title: str
    prompt: str
    content: str
    rolling_summary: str | None = None
    min_words: int | None = 1000
    max_words: int | None = 2000
    
    class Config:
        from_attributes = True



class ExportTranslateReq(BaseModel):
    title: str
    prompt: str
    content: str
    mode: Literal["vi-to-en", "en-to-vi"]


class ExportTranslateResp(BaseModel):
    title: str
    prompt: str
    content: str
class AudioGenerateReq(BaseModel):
    prompt: str  # Thay text thành prompt để AI hiểu và sinh nội dung
    language: Literal["vietnamese", "english"] = "vietnamese"
    voice: str = "female"  


class AudioResponse(BaseModel):
    id: str
    project_id: str
    title: str
    audio_url: str
    created_at: str

    class Config:
        from_attributes = True


class AudioJobCreateReq(BaseModel):
    prompt: str
    language: Literal["vietnamese", "english"] = "vietnamese"


class AudioJobCreateResp(BaseModel):
    job_id: str
    status: Literal["queued"]


class AudioJobStatusResp(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "done", "failed"]
    audio_url: str | None = None
    error: str | None = None
    created_at: str


# Pydantic schemas for Prompt Templates
class PromptTemplateCreate(BaseModel):
    name: str
    template_text: str
    content_type: Literal["novel", "comic_script", "video_script", "lyrics", "other"] = "novel"
    is_public: bool = False
    team_id: str | None = None


class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    template_text: str | None = None
    content_type: Literal["novel", "comic_script", "video_script", "lyrics", "other"] | None = None
    is_public: bool | None = None
    team_id: str | None = None


class PromptTemplateResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID | None
    team_id: uuid.UUID | None
    name: str
    content_type: str
    template_text: str
    is_public: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
