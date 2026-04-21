from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import os
import time
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

from pydantic import BaseModel # Kept existing

import models
from database import get_db
from auth import get_current_user

# Tạo Router cho group API liên quan đến Dự án, có prefix là /api/projects
router = APIRouter(prefix="/api/projects", tags=["Projects"])


# Schema đã được chuyển qua models.py

def _build_recent_context(db: Session, project_id: str) -> str:
    entries = (
        db.query(models.ProjectContextEntry)
        .filter(models.ProjectContextEntry.project_id == project_id)
        .order_by(models.ProjectContextEntry.created_at.desc())
        .limit(6)
        .all()
    )
    if not entries:
        return ""

    blocks = []
    for idx, entry in enumerate(reversed(entries), start=1):
        blocks.append(
            f"Lượt {idx}:\n"
            f"- Prompt: {entry.prompt}\n"
            f"- Nội dung đã sinh: {entry.generated_content[:900]}"
        )
    return "\n\n".join(blocks)


def generate_story_content(
    title: str,
    instruction: str,
    previous_content: str = "",
    language: str = "vietnamese",
    recent_context: str = "",
) -> str:
    generated_content = ""
    try:
        from dotenv import find_dotenv
        load_dotenv(find_dotenv(), override=True)
        api_key = os.getenv("hf_key_read")

        if not api_key:
             return "Hệ thống chưa cấu hình Hugging Face API Key (hf_key_read). Xin vui lòng liên hệ Admin."

        client = InferenceClient(token=api_key)
        context_block = ""
        if previous_content.strip():
            context_block = (
                "Ngữ cảnh nội dung trước đó (hãy giữ mạch văn và logic nhất quán):\n"
                f"{previous_content[-5000:]}\n\n"
            )
        if recent_context.strip():
            context_block += (
                "Tóm tắt lịch sử các lượt trước (ưu tiên dùng để giữ continuity):\n"
                f"{recent_context}\n\n"
            )

        language_label = "vietnamese" if language == "vietnamese" else "english"
        if language_label == "english":
            context_block = (
                "Context from previous content (keep continuity and consistency):\n"
                f"{previous_content[-2500:]}\n\n"
            ) if previous_content.strip() else ""
            prompt = (
                f"Write the next part of this story in {language_label}.\n"
                f"Title: {title}\n"
                f"Current instruction: {instruction}\n\n"
                f"{context_block}"
                "New generated content:\n"
            )
            system_prompt = (
                "You are a creative fiction writer. "
                "Always respond in the selected language: english."
            )
        else:
            prompt = (
                f"Hãy viết tiếp nội dung truyện sáng tạo bằng {language_label}.\n"
                f"Tiêu đề: {title}\n"
                f"Yêu cầu hiện tại: {instruction}\n\n"
                f"{context_block}"
                "Ràng buộc bắt buộc:\n"
                "- Chỉ dùng tiếng Việt, tuyệt đối không chèn câu tiếng Anh.\n"
                "- Nếu có thuật ngữ riêng (Pokemon, Team Rocket, Gym), giữ nguyên tên riêng, còn lại viết tiếng Việt tự nhiên.\n"
                "- Không mâu thuẫn với các sự kiện đã có ở chương trước.\n\n"
                "Nội dung mới cần sinh:\n"
            )
            system_prompt = (
                "Bạn là nhà văn chuyên sáng tác truyện hư cấu. "
                "Luôn trả lời bằng đúng ngôn ngữ được chọn: vietnamese. "
                "Tuyệt đối không dùng tiếng Anh cho câu mô tả hoặc hội thoại."
            )

        max_retries = 15
        for attempt in range(max_retries):
            try:
                messages = [
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {"role": "user", "content": prompt}
                ]

                response = client.chat_completion(
                    model="Qwen/Qwen2.5-72B-Instruct",
                    messages=messages,
                    max_tokens=1500,
                    temperature=0.7
                )

                if response and response.choices:
                    generated_content = str(response.choices[0].message.content).strip()
                else:
                    generated_content = "AI không thể sinh nội dung với cấu hình Prompt này, hoặc model đang quá tải trên Hugging Face."
                break

            except Exception as model_e:
                err_str = str(model_e).lower()
                if ("loading" in err_str or "503" in err_str or "unavailable" in err_str or "overloaded" in err_str):
                    if attempt < max_retries - 1:
                        print(f"Server AI đang boot... Đợi 10s rồi thử lại (Lần {attempt+1}/{max_retries})")
                        time.sleep(10)
                        continue
                raise model_e

    except Exception as e:
        print(f"Lỗi khi gọi Hugging Face API: {e}")
        generated_content = f"Xin lỗi, quá trình sinh nội dung bằng Hugging Face bị gián đoạn.\nChi tiết (Model 72B đang cạn tài nguyên trên Inference API lúc này): {str(e)}"

    return generated_content

@router.get("/", response_model=List[models.ProjectResponse])
def get_all_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Lấy toàn bộ Project của User ĐANG ĐĂNG NHẬP.
    Dependency get_current_user sẽ chặn mọi request không có Token hợp lệ.
    """
    # Lấy ra tất cả các Project mà có user_id khớp với ID của current_user (từ Token)
    projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).all()
    
    # Ép kiểu UUID của pydantic trả về (do JSON không hỗ trợ uuid gốc)
    return [
        models.ProjectResponse(
            id=str(p.id),
            title=p.title,
            prompt=p.prompt,
            content=p.content
        ) for p in projects
    ]


@router.post("/", response_model=models.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(data: models.ProjectCreateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Tạo Project mới và sinh nội dung bằng Hugging Face Model (FrostAura).
    Bắt buộc có JWT Token.
    """
    # 1. Gọi LLM API để sinh nội dung dựa trên prompt của user
    generated_content = generate_story_content(title=data.title, instruction=data.prompt, language=data.language)

    # 2. Tạo bản ghi dự án mới với nội dung AI vừa sinh
    new_project = models.Project(
        user_id=current_user.id, # Tự động lấy ID người dùng từ Token làm khoá ngoại (FK)
        title=data.title,
        prompt=data.prompt,
        content=generated_content
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    db.add(
        models.ProjectContextEntry(
            project_id=new_project.id,
            prompt=data.prompt,
            language=data.language,
            generated_content=generated_content,
        )
    )
    db.commit()
    
    # 3. Trả về kết quả cho Frontend
    return models.ProjectResponse(
        id=str(new_project.id),
        title=new_project.title,
        prompt=new_project.prompt,
        content=new_project.content
    )


@router.post("/{project_id}/continue", response_model=models.ProjectResponse)
def continue_project(project_id: str, data: models.ProjectContinueReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    recent_context = _build_recent_context(db, project.id)
    new_chunk = generate_story_content(
        title=project.title,
        instruction=data.prompt,
        previous_content=project.content or "",
        language=data.language,
        recent_context=recent_context,
    )

    project.prompt = data.prompt
    if project.content and project.content.strip():
        project.content = f"{project.content.rstrip()}\n\n---\n\n{new_chunk}"
    else:
        project.content = new_chunk

    db.commit()
    db.refresh(project)

    db.add(
        models.ProjectContextEntry(
            project_id=project.id,
            prompt=data.prompt,
            language=data.language,
            generated_content=new_chunk,
        )
    )
    db.commit()

    return models.ProjectResponse(
        id=str(project.id),
        title=project.title,
        prompt=project.prompt,
        content=project.content,
    )


@router.get("/{project_id}", response_model=models.ProjectResponse)
def get_project_by_id(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Lấy chi tiết 1 Project theo ID.
    Bắt buộc phải kiểm tra quyền sở hữu (ownership).
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    
    # 1. Kiểm tra Project có tồn tại không
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
        
    # 2. Quan Trọng: Kiểm tra quyền sở hữu
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")
        
    return models.ProjectResponse(
        id=str(project.id),
        title=project.title,
        prompt=project.prompt,
        content=project.content
    )


@router.get("/{project_id}/contexts")
def get_project_contexts(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập Project này.")

    entries = (
        db.query(models.ProjectContextEntry)
        .filter(models.ProjectContextEntry.project_id == project.id)
        .order_by(models.ProjectContextEntry.created_at.asc())
        .all()
    )

    return {
        "project_id": str(project.id),
        "contexts": [
            {
                "id": str(e.id),
                "prompt": e.prompt,
                "language": e.language,
                "generated_content": e.generated_content,
                "created_at": e.created_at,
            }
            for e in entries
        ],
    }


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Xóa 1 Project theo ID.
    Bắt buộc phải kiểm tra quyền sở hữu (ownership).
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    
    # 1. Kiểm tra Project có tồn tại không
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Project.")
        
    # 2. Quan Trọng: Kiểm tra quyền sở hữu trước khi xóa
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xóa Project này.")
        
    # Dọn context history tường minh trước khi xóa project để tránh dữ liệu mồ côi
    # trong trường hợp DB chưa áp dụng đầy đủ FK ON DELETE CASCADE.
    db.query(models.ProjectContextEntry).filter(
        models.ProjectContextEntry.project_id == project.id
    ).delete(synchronize_session=False)

    db.delete(project)
    db.commit()
    
    return None
