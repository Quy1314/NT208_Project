from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

import models
from database import get_db
from auth import get_current_user
from generation.story import generate_story_content

# Dùng base prefix /api, module Story đi theo subpath /story.
# Team khác có thể thêm module riêng như /comic, /clip, /music mà không đổi kiến trúc gốc.
storyRouter = APIRouter(prefix="/api", tags=["Story"])


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

@storyRouter.get("/story/", response_model=List[models.ProjectResponse])
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


@storyRouter.post("/story/", response_model=models.ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(data: models.ProjectCreateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    API Tạo Project mới và sinh nội dung bằng Hugging Face Model (FrostAura).
    Bắt buộc có JWT Token.
    """
    # 1. Gọi LLM API để sinh nội dung dựa trên prompt của user
    generated_content = generate_story_content(
        title=data.title,
        instruction=data.prompt,
        language=data.language,
    )

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


@storyRouter.post("/story/{project_id}/continue", response_model=models.ProjectResponse)
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


@storyRouter.get("/story/{project_id}", response_model=models.ProjectResponse)
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


@storyRouter.get("/story/{project_id}/contexts")
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


@storyRouter.delete("/story/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
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
