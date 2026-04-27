from sqlalchemy import Column, String, Text, ForeignKey, TIMESTAMP, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

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
    # Map Python attribute user_id -> DB column owner_id for backward compatibility.
    user_id = Column("owner_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    prompt = Column(Text, nullable=False)
    content = Column(Text, nullable=False, server_default="")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    context_entries = relationship("ProjectContextEntry", back_populates="project")


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

# ==========================================
# PYDANTIC SCHEMAS (Data Validation Models)
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

class ProjectContinueReq(BaseModel):
    prompt: str
    language: Literal["vietnamese", "english"] = "vietnamese"
    model_name: str | None = None

class ProjectResponse(BaseModel):
    id: str
    title: str
    prompt: str
    content: str
    
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
    text: str
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
