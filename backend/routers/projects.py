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
    generated_content = ""
    try:
        # Load lại file .env mới nhất (tránh việc Uvicorn cache env cũ lúc chưa gán Key)
        from dotenv import find_dotenv
        load_dotenv(find_dotenv(), override=True)
        # Lấy API KEY từ file .env (User đã gán biến hf_key_read trong file auth)
        api_key = os.getenv("hf_key_read") 
        
        # Nếu chưa setup API Key, trả về báo lỗi thân thiện thay vì crash
        if not api_key:
             generated_content = "Hệ thống chưa cấu hình Hugging Face API Key (hf_key_read). Xin vui lòng liên hệ Admin."
        else:
             # Cấu hình thư viện Hugging Face InferenceClient
             client = InferenceClient(token=api_key)
             
             # Khởi tạo câu Prompt
             prompt = f"Write a creative fiction novel chapter based on the following.\nTitle: {data.title}\nInstruction: {data.prompt}\n\nChapter Content:\n"
             
             # Gửi request lên Hugging Face (Model: Qwen2.5-72B-Instruct - ổn định, văn phong mượt, rất tốt cho tiểu thuyết)
             # Vòng lặp chờ model khởi động (Cold-start)
             max_retries = 15
             for attempt in range(max_retries):
                 try:
                     messages = [
                         {"role": "system", "content": "You are a creative author specializing in fiction novels."},
                         {"role": "user", "content": prompt}
                     ]
                     
                     response = client.chat_completion(
                         model="Qwen/Qwen2.5-72B-Instruct",
                         messages=messages,
                         max_tokens=1500,
                         temperature=0.7
                     )
                     
                     # Rút trích nội dung do AI trả về
                     if response and response.choices:
                        generated_content = str(response.choices[0].message.content).strip()
                     else:
                        generated_content = "AI không thể sinh nội dung với cấu hình Prompt này, hoặc model đang quá tải trên Hugging Face."
                     break # Thành công -> thoát vòng lặp
                     
                 except Exception as model_e:
                     err_str = str(model_e).lower()
                     if ("loading" in err_str or "503" in err_str or "unavailable" in err_str or "overloaded" in err_str):
                         if attempt < max_retries - 1:
                             print(f"Server AI đang boot... Đợi 10s rồi thử lại (Lần {attempt+1}/{max_retries})")
                             time.sleep(10)
                             continue
                     # Nếu là lỗi khác hoặc hết lượt thử thì quăng ra catch bên ngoài
                     raise model_e
             
    except Exception as e:
        print(f"Lỗi khi gọi Hugging Face API: {e}")
        # Báo cho người dùng biết hệ thống bị lỗi hoặc chờ quá lâu
        generated_content = f"Xin lỗi, quá trình sinh nội dung bằng Hugging Face bị gián đoạn.\nChi tiết (Model 72B đang cạn tài nguyên trên Inference API lúc này): {str(e)}"

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
    
    # 3. Trả về kết quả cho Frontend
    return models.ProjectResponse(
        id=str(new_project.id),
        title=new_project.title,
        prompt=new_project.prompt,
        content=new_project.content
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
        
    db.delete(project)
    db.commit()
    
    return None
