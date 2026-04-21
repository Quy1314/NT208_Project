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
    return [models.TeamResponse(id=str(t.id), name=t.name) for t in teams]


@router.post("/", response_model=models.TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(data: models.TeamCreateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên team tối thiểu 2 ký tự.")

    team = models.TeamWorkspace(owner_id=current_user.id, name=name)
    db.add(team)
    db.commit()
    db.refresh(team)
    return models.TeamResponse(id=str(team.id), name=team.name)


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
