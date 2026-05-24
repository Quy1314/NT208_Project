from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
import secrets

import models
from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/teams", tags=["Teams"])


@router.get("/", response_model=list[models.TeamResponse])
def get_my_teams(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    teams = db.query(models.TeamWorkspace).filter(models.TeamWorkspace.owner_id == current_user.id).all()
    return [models.TeamResponse(id=str(t.id), name=str(t.name)) for t in teams]


@router.post("/", response_model=models.TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(data: models.TeamCreateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên team tối thiểu 2 ký tự.")

    team = models.TeamWorkspace(owner_id=current_user.id, name=name)
    db.add(team)
    db.commit()
    db.refresh(team)
    return models.TeamResponse(id=str(team.id), name=str(team.name))


@router.post("/project-token")
def get_or_create_project_team_token(
    project_id: str = Query(...),
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy project.")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với project này.")

    team = db.query(models.TeamWorkspace).filter(models.TeamWorkspace.id == team_id).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy team.")
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với team này.")

    item = (
        db.query(models.ProjectTeamToken)
        .filter(models.ProjectTeamToken.project_id == project.id, models.ProjectTeamToken.team_id == team.id)
        .first()
    )
    if not item:
        token = f"tw_{secrets.token_urlsafe(24)}"
        item = models.ProjectTeamToken(project_id=project.id, team_id=team.id, token=token)
        db.add(item)
        db.commit()
        db.refresh(item)

    return {
        "project_id": str(project.id),
        "team_id": str(team.id),
        "token": item.token,
    }


@router.post("/{team_id}/join")
def join_team(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        from uuid import UUID
        team_uuid = UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID nhóm không hợp lệ.")

    team = db.query(models.TeamWorkspace).filter(models.TeamWorkspace.id == team_uuid).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nhóm.")

    # Check if owner
    if team.owner_id == current_user.id:
        return {"message": "Bạn là chủ sở hữu của nhóm này.", "team_id": team_id}

    # Check if already joined
    existing_member = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == team_uuid,
        models.TeamMember.user_id == current_user.id
    ).first()
    if existing_member:
        return {"message": "Bạn đã tham gia nhóm này rồi.", "team_id": team_id}

    # Join
    member = models.TeamMember(team_id=team_uuid, user_id=current_user.id, role="member")
    db.add(member)
    db.commit()
    db.refresh(member)
    return {"message": "Tham gia nhóm thành công.", "team_id": team_id}


@router.post("/{team_id}/quit")
def quit_team(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        from uuid import UUID
        team_uuid = UUID(team_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID nhóm không hợp lệ.")

    team = db.query(models.TeamWorkspace).filter(models.TeamWorkspace.id == team_uuid).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nhóm.")

    if team.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Chủ sở hữu nhóm không thể quit nhóm. Hãy xóa nhóm nếu cần."
        )

    # Check if member
    member = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == team_uuid,
        models.TeamMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bạn chưa tham gia nhóm này.")

    db.delete(member)
    db.commit()
    return {"message": "Rời nhóm thành công.", "team_id": team_id}


@router.post("/{team_id}/leave")
def leave_team(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return quit_team(team_id, db, current_user)

