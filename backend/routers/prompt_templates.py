from uuid import UUID
from typing import List, cast, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

import models
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/prompt-templates", tags=["Prompt Templates"])


def _template_uuid(template_id: str | UUID) -> UUID:
    if isinstance(template_id, UUID):
        return template_id
    try:
        return UUID(template_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Không tìm thấy Prompt Template."
        )


@router.post("/", response_model=models.PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    data: models.PromptTemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    API tạo Prompt Template mới.
    """
    # Nếu có team_id, kiểm tra xem team workspace đó có thuộc sở hữu của user hiện tại không
    team_uuid = None
    if data.team_id:
        try:
            team_uuid = UUID(data.team_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID nhóm không hợp lệ.")
            
        team = db.query(models.TeamWorkspace).filter(
            models.TeamWorkspace.id == team_uuid,
            models.TeamWorkspace.owner_id == current_user.id
        ).first()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Bạn không có quyền quản lý không gian nhóm này."
            )

    new_template = models.PromptTemplate(
        owner_id=current_user.id,
        team_id=team_uuid,
        name=data.name.strip(),
        content_type=data.content_type,
        template_text=data.template_text.strip(),
        is_public=data.is_public
    )

    db.add(new_template)
    db.commit()
    db.refresh(new_template)

    return new_template


@router.get("/", response_model=List[models.PromptTemplateResponse])
def list_templates(
    team_id: str | None = Query(None),
    include_public: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    API danh sách Prompt Templates.
    - Trả về danh sách templates cá nhân và templates công cộng (nếu include_public=True).
    - Lọc cụ thể theo team_id (nếu cung cấp và user sở hữu/có quyền với team).
    """
    query = db.query(models.PromptTemplate)

    if team_id:
        try:
            team_uuid = UUID(team_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID nhóm không hợp lệ.")
            
        # Xác minh quyền sở hữu của team
        team = db.query(models.TeamWorkspace).filter(
            models.TeamWorkspace.id == team_uuid,
            models.TeamWorkspace.owner_id == current_user.id
        ).first()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Bạn không có quyền truy cập không gian nhóm này."
            )
        
        # Chỉ lấy các template thuộc team này
        query = query.filter(models.PromptTemplate.team_id == team_uuid)
    else:
        # Lấy templates cá nhân của user
        filters = [models.PromptTemplate.owner_id == current_user.id]
        # Thêm templates công cộng
        if include_public:
            filters.append(models.PromptTemplate.is_public == True)
            
        # Lấy các team workspaces do user sở hữu để hiển thị templates của các teams đó luôn
        my_team_ids = db.query(models.TeamWorkspace.id).filter(
            models.TeamWorkspace.owner_id == current_user.id
        ).all()
        if my_team_ids:
            filters.append(models.PromptTemplate.team_id.in_([t[0] for t in my_team_ids]))

        query = query.filter(or_(*filters))

    templates = query.order_by(models.PromptTemplate.created_at.desc()).all()
    return templates


@router.get("/{id}", response_model=models.PromptTemplateResponse)
def get_template_details(
    id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    API lấy chi tiết một Prompt Template.
    """
    uuid_id = _template_uuid(id)
    template = db.query(models.PromptTemplate).filter(models.PromptTemplate.id == uuid_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Không tìm thấy Prompt Template."
        )

    # Kiểm tra quyền xem
    is_owner = template.owner_id == current_user.id
    is_public = template.is_public
    is_team_member = False

    if template.team_id:
        team = db.query(models.TeamWorkspace).filter(
            models.TeamWorkspace.id == template.team_id,
            models.TeamWorkspace.owner_id == current_user.id
        ).first()
        if team:
            is_team_member = True

    if not is_owner and not is_public and not is_team_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Bạn không có quyền truy cập Prompt Template này."
        )

    return template


@router.put("/{id}", response_model=models.PromptTemplateResponse)
def update_template(
    id: str,
    data: models.PromptTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    API cập nhật một Prompt Template.
    """
    uuid_id = _template_uuid(id)
    template = db.query(models.PromptTemplate).filter(models.PromptTemplate.id == uuid_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Không tìm thấy Prompt Template."
        )

    # Chỉ owner của template mới được sửa
    if template.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Bạn không có quyền chỉnh sửa Prompt Template này."
        )

    # Cập nhật các trường
    if data.name is not None:
        template.name = data.name.strip()
    if data.template_text is not None:
        template.template_text = data.template_text.strip()
    if data.content_type is not None:
        template.content_type = data.content_type
    if data.is_public is not None:
        template.is_public = data.is_public
        
    if data.team_id is not None:
        if data.team_id == "":
            template.team_id = None
        else:
            try:
                new_team_uuid = UUID(data.team_id)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID nhóm không hợp lệ.")
                
            team = db.query(models.TeamWorkspace).filter(
                models.TeamWorkspace.id == new_team_uuid,
                models.TeamWorkspace.owner_id == current_user.id
            ).first()
            if not team:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="Bạn không có quyền quản lý nhóm này."
                )
            template.team_id = new_team_uuid

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{id}")
def delete_template(
    id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    API xóa Prompt Template.
    """
    uuid_id = _template_uuid(id)
    template = db.query(models.PromptTemplate).filter(models.PromptTemplate.id == uuid_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Không tìm thấy Prompt Template."
        )

    # Chỉ owner của template mới được xóa
    if template.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Bạn không có quyền xóa Prompt Template này."
        )

    db.delete(template)
    db.commit()

    return {"message": "Xóa Prompt Template thành công."}
