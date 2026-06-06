import os
import sys
import time
import argparse
import re
import traceback
from pathlib import Path
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
import sqlalchemy as sa

# Thêm thư mục backend vào sys.path để import các module local
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
import models

# Nạp file môi trường .env
dotenv_path = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)

def count_vietnamese_words(text: str) -> int:
    if not text:
        return 0
    # Xóa ký tự định dạng markdown và HTML để tránh đếm sai
    clean_text = re.sub(r"[#*_`~\[\]\(\)\-+=\|]", " ", text)
    clean_text = re.sub(r"<[^>]*>", " ", clean_text)
    # Sử dụng regex tìm tất cả từ chứa chữ cái (kể cả tiếng Việt có dấu)
    words = re.findall(r"\w+", clean_text, re.UNICODE)
    return len(words)

def call_llm_with_retry(api_key: str, model_id: str, messages: list, max_tokens: int = 4096, temperature: float = 0.7) -> str:
    client = InferenceClient(token=api_key)
    retries = 3
    backoff_times = [10, 30, 60]
    
    for attempt in range(retries):
        try:
            print(f"  [API Call] Gửi yêu cầu tới model {model_id} (Lần thử {attempt+1}/{retries})...")
            response = client.chat_completion(
                model=model_id,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            if response and response.choices:
                content = str(response.choices[0].message.content).strip()
                if content:
                    return content
            raise RuntimeError("API response choices are empty.")
        except Exception as e:
            err_str = str(e).lower()
            print(f"  [API Warning] Lỗi API LLM: {e}")
            if attempt < retries - 1:
                wait_time = backoff_times[attempt]
                print(f"  [API Retry] Đợi {wait_time} giây và thử lại...")
                time.sleep(wait_time)
            else:
                raise e
    return ""

def main():
    parser = argparse.ArgumentParser(description="Script tự động sinh truyện Tu Tiên kịch tính và an toàn.")
    parser.add_argument("--user-email", required=True, help="Email của user sở hữu project.")
    parser.add_argument("--project-title", required=True, help="Tiêu đề của truyện.")
    parser.add_argument("--chapters", type=int, default=10, help="Số chương muốn sinh.")
    parser.add_argument("--min-words", type=int, default=2500, help="Số chữ tối thiểu mỗi chương.")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm liên kết và prompt mà không gọi model hoặc lưu dữ liệu.")
    parser.add_argument("--sample-run", action="store_true", help="Chạy sinh thử 1 chương ngắn (300-500 từ) để kiểm tra model.")
    parser.add_argument("--force-regenerate-outline", action="store_true", help="Bắt buộc tạo lại Story Bible và Outline.")
    parser.add_argument("--resume-stale", action="store_true", help="Cho phép tiếp tục sinh chương đang bị kẹt ở trạng thái 'generating'.")
    
    args = parser.parse_args()
    
    # Kiểm tra Hugging Face API key
    api_key = os.getenv("hf_key_read")
    if not api_key:
        print("[FAIL] Không tìm thấy hf_key_read trong file backend/.env hoặc môi trường!")
        sys.exit(1)
        
    db = SessionLocal()
    try:
        # 1. Tìm User
        user = db.query(models.User).filter(models.User.email == args.user_email).first()
        if not user:
            print(f"[FAIL] Không tìm thấy user với email: {args.user_email}")
            return
            
        print(f"[SUCCESS] Tìm thấy user: {user.email} (ID: {user.id})")
        
        # 2. Tìm hoặc Tạo Project
        project = db.query(models.Project).filter(
            models.Project.user_id == user.id,
            models.Project.title == args.project_title
        ).first()
        
        project_existed = project is not None
        if not project_existed:
            if args.dry_run:
                print(f"[DRY-RUN] Sẽ tạo dự án mới với tiêu đề '{args.project_title}'")
            else:
                project = models.Project(
                    user_id=user.id,
                    title=args.project_title,
                    prompt="Hành trình nghịch thiên tu tiên huyền ảo.",
                    content="",
                    min_words=args.min_words,
                    max_words=args.min_words + 1000
                )
                db.add(project)
                db.commit()
                db.refresh(project)
                print(f"[SUCCESS] Đã tạo dự án mới: '{args.project_title}' (ID: {project.id})")
        else:
            print(f"[SUCCESS] Tìm thấy dự án hiện có: '{args.project_title}' (ID: {project.id})")
            
        if args.dry_run:
            print("\n=== [DRY-RUN MOCK UP PROMPTS] ===")
            print(f"Project Title: {args.project_title}")
            print(f"Target Chapters: {args.chapters}")
            print(f"Min Words per Chapter: {args.min_words}")
            print(f"Status: Kết nối DB thành công. Không có API token nào bị tiêu tốn.")
            return

        if project is None:
            raise RuntimeError("Không tìm thấy Project hoặc không khởi tạo được.")

        # 3. Sinh hoặc tải lại Story Bible và Chapter Outline
        model_id = "Qwen/Qwen2.5-72B-Instruct"
        
        has_bible = bool(project.story_bible and str(project.story_bible).strip())
        has_outline = bool(project.outline and str(project.outline).strip())
        
        if not has_bible or not has_outline or args.force_regenerate_outline:
            print("[PROCESS] Đang sinh Story Bible mới cho bộ truyện...")
            bible_prompt = [
                {"role": "system", "content": "Bạn là một nhà văn mạng chuyên nghiệp. Hãy viết một Story Bible (Thế giới quan và thiết lập nhân vật) cho dự án truyện tu tiên."},
                {"role": "user", "content": f"Hãy viết Story Bible chi tiết cho truyện '{args.project_title}'. Bao gồm: các cảnh giới tu luyện, các thế lực lớn, các nhân vật chủ chốt (đặc biệt là Lý Thất Dạ) và mâu thuẫn chính."}
            ]
            story_bible = call_llm_with_retry(api_key, model_id, bible_prompt)
            
            print("[PROCESS] Đang sinh Đề cương chương (Chapter Outline) mới...")
            outline_prompt = [
                {"role": "system", "content": "Bạn là một nhà văn mạng chuyên nghiệp. Hãy lập đề cương chi tiết cho từng chương dựa vào Story Bible."},
                {"role": "user", "content": f"Dựa vào Story Bible sau:\n{story_bible}\n\nHãy viết Đề cương chi tiết gồm {args.chapters} chương cho truyện '{args.project_title}'. Định dạng mỗi chương bắt buộc theo mẫu:\nChương X: [Tên chương]\nNội dung chính: [Tóm tắt chi tiết diễn biến]\n\nHãy viết đầy đủ {args.chapters} chương bằng tiếng Việt."}
            ]
            outline = call_llm_with_retry(api_key, model_id, outline_prompt)
            
            # Lưu lại vào Project
            setattr(project, "story_bible", story_bible)
            setattr(project, "outline", outline)
            db.commit()
            db.refresh(project)
            print("[SUCCESS] Đã tạo và lưu thành công Story Bible và Outline chương vào database.")
        else:
            print("[INFO] Đã tìm thấy Story Bible và Outline hiện có. Tự động tái sử dụng để giữ mạch truyện thống nhất.")
            story_bible = str(project.story_bible)
            outline = str(project.outline)

        # 4. Trích xuất tiêu đề chương từ Outline
        # Pattern match: "Chương 1: Tiêu đề"
        pattern = re.compile(r"Chương\s+(\d+)[:\-\s]+([^\n]+)", re.IGNORECASE)
        matches = pattern.findall(outline)
        chapter_titles = {}
        for num_str, title in matches:
            chapter_titles[int(num_str)] = title.strip()
            
        print(f"[INFO] Trích xuất được {len(chapter_titles)} tiêu đề chương từ outline.")

        # Định cấu hình số chương và số từ cho chạy thử sample
        loop_chapters = 1 if args.sample_run else args.chapters
        target_min_words = 300 if args.sample_run else args.min_words
        target_max_words = 500 if args.sample_run else (args.min_words + 1000)
        
        if args.sample_run:
            print(f"[SAMPLE RUN] Đang chạy sinh thử nghiệm 1 chương ngắn ({target_min_words}-{target_max_words} từ)...")

        # 5. Vòng lặp sinh từng chương truyện
        for i in range(1, loop_chapters + 1):
            chapter_title = chapter_titles.get(i, f"Đế Bá Chi Lộ - Chương {i}")
            print(f"\n==========================================")
            print(f"BẮT ĐẦU XỬ LÝ CHƯƠNG {i}: {chapter_title}")
            print(f"==========================================")
            
            # --- TRANSACTION BOUNDARY 1: Kiểm tra & cập nhật trạng thái khởi đầu ---
            check_db = SessionLocal()
            try:
                ch_record = check_db.query(models.Chapter).filter(
                    models.Chapter.project_id == project.id,
                    models.Chapter.chapter_number == i
                ).first()
                
                if ch_record:
                    status_str = str(ch_record.status)
                    if status_str == "completed":
                        print(f"[SKIP] Chương {i} đã hoàn thành (completed). Bỏ qua.")
                        check_db.close()
                        continue
                    elif status_str == "generating":
                        now_ts = time.time()
                        from datetime import datetime
                        updated_at_val = getattr(ch_record, "updated_at", None)
                        updated_ts = updated_at_val.timestamp() if isinstance(updated_at_val, datetime) else 0
                        time_diff = now_ts - updated_ts
                        if time_diff < 600 and not args.resume_stale:
                            print(f"[SKIP] Chương {i} đang trong trạng thái 'generating' hoạt động (cập nhật {int(time_diff)} giây trước). Bỏ qua để tránh chạy song song/race condition.")
                            check_db.close()
                            continue
                        else:
                            print(f"[RESUME] Chương {i} đang bị kẹt hoặc đã quá hạn sinh. Bắt đầu sinh lại...")
                            setattr(ch_record, "status", "generating")
                            setattr(ch_record, "updated_at", sa.func.now())
                            check_db.commit()
                    else:
                        print(f"[RESUME] Chương {i} đang ở trạng thái '{status_str}'. Bắt đầu sinh tiếp...")
                        setattr(ch_record, "status", "generating")
                        setattr(ch_record, "updated_at", sa.func.now())
                        check_db.commit()
                else:
                    ch_record = models.Chapter(
                        project_id=project.id,
                        chapter_number=i,
                        title=chapter_title,
                        status="generating",
                        content=""
                    )
                    check_db.add(ch_record)
                    check_db.commit()
                    print(f"[INIT] Khởi tạo record cho Chương {i} thành công.")
                
                chapter_id = ch_record.id
                partial_content = str(ch_record.content or "")
            finally:
                check_db.close()

            # --- PREPARE CONTEXT & LLM CALL (Không giữ transaction DB mở) ---
            # Lấy ngữ cảnh "Previous Chapter Bridge"
            bridge_text = ""
            if i > 1:
                bridge_db = SessionLocal()
                try:
                    prev_ch = bridge_db.query(models.Chapter).filter(
                        models.Chapter.project_id == project.id,
                        models.Chapter.chapter_number == i - 1
                    ).first()
                    prev_content = getattr(prev_ch, "content", "")
                    if prev_ch is not None and prev_content:
                        # Lấy 2000 ký tự cuối làm narrative bridge
                        last_chars = str(prev_content)[-2000:]
                        bridge_text = (
                            f"=== Phần kết của Chương {i-1} (Dùng để kết nối văn cảnh liền mạch) ===\n"
                            f"... {last_chars}\n"
                            f"================================================================"
                        )
                finally:
                    bridge_db.close()
            
            # Xây dựng Prompt sinh nội dung
            rolling_summary_val = str(project.rolling_summary or "")
            
            system_prompt = (
                "Bạn là một nhà văn chuyên sáng tác truyện hư cấu tu tiên huyền ảo bằng tiếng Việt.\n"
                "Tuyệt đối không sử dụng tiếng Anh hay bất kỳ ghi chú ngoài lề nào trong phản hồi, chỉ trả về nội dung chương truyện."
            )
            
            instruction = (
                f"Hãy viết Chương {i} cho bộ truyện tu tiên '{args.project_title}' với tiêu đề chương là '{chapter_title}'.\n"
                f"Nội dung chương này: Lý Thất Dạ tiếp tục hành trình nghịch thiên của mình.\n"
                f"Văn văn tu tiên kịch tính, hoành tráng, miêu tả chi tiết cảnh giới và chiêu thức chiến đấu.\n"
                f"YÊU CẦU ĐỘ DÀI: Viết chi tiết, mô tả sâu sắc tâm lý và hội thoại để chương dài ít nhất {target_min_words} chữ.\n"
            )
            
            context_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "system", "content": f"Story Bible & Cảnh giới:\n{story_bible}"}
            ]
            
            if rolling_summary_val.strip():
                context_messages.append({"role": "system", "content": f"Tóm tắt cốt truyện các chương trước:\n{rolling_summary_val}"})
                
            if bridge_text:
                context_messages.append({"role": "system", "content": bridge_text})
                
            context_messages.append({"role": "user", "content": instruction})
            
            # Gọi LLM sinh chương
            start_time = time.time()
            generated_text = ""
            error_message = None
            
            try:
                # Nếu chương có content partial sẵn, sử dụng nó thay vì viết lại từ đầu
                if partial_content.strip():
                    print(f"[INFO] Phát hiện nội dung partial có sẵn ({count_vietnamese_words(partial_content)} từ). Đang khôi phục để viết tiếp...")
                    generated_text = partial_content
                else:
                    generated_text = call_llm_with_retry(api_key, model_id, context_messages, max_tokens=4096)
                
                # Vòng lặp đếm từ và sinh tiếp (auto-continuation)
                current_words = count_vietnamese_words(generated_text)
                print(f"[INFO] Độ dài sinh ra đến hiện tại: {current_words} từ | {len(generated_text)} ký tự.")
                
                max_continuations = 3
                for cont_idx in range(max_continuations):
                    if current_words >= target_min_words:
                        break
                        
                    print(f"  [Auto-Continue] Số chữ hiện tại ({current_words}) dưới ngưỡng {target_min_words} chữ. Tiếp tục sinh...")
                    cont_instruction = (
                        f"Nội dung hiện tại mới chỉ có {current_words} chữ. "
                        f"Hãy tiếp tục viết tiếp chương {i} ngay lập tức từ chỗ bạn vừa dừng để đạt tối thiểu {target_min_words} chữ. "
                        f"Tuyệt đối không lặp lại nội dung đã viết ở trên."
                    )
                    
                    cont_messages = list(context_messages) + [
                        {"role": "assistant", "content": generated_text},
                        {"role": "user", "content": cont_instruction}
                    ]
                    
                    cont_text = call_llm_with_retry(api_key, model_id, cont_messages, max_tokens=3072)
                    if cont_text:
                        generated_text += "\n\n" + cont_text
                        current_words = count_vietnamese_words(generated_text)
                        print(f"  [Auto-Continue Done] Lượt tiếp nối {cont_idx+1} hoàn thành. Tổng số từ: {current_words} từ.")
                    else:
                        break
                        
            except Exception as model_err:
                error_message = str(model_err)
                print(f"[ERROR] Quá trình sinh chương {i} gặp sự cố: {model_err}")
            
            duration = time.time() - start_time
            final_words = count_vietnamese_words(generated_text)
            
            # --- TRANSACTION BOUNDARY 2: Lưu kết quả (Success/Partial/Failed) ---
            save_db = SessionLocal()
            try:
                ch_record = save_db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
                if ch_record:
                    setattr(ch_record, "generation_time", float(duration))
                    setattr(ch_record, "word_count", int(final_words))
                    setattr(ch_record, "updated_at", sa.func.now())
                    
                    if error_message:
                        setattr(ch_record, "error_message", str(error_message))
                        if generated_text.strip():
                            setattr(ch_record, "content", str(generated_text))
                            setattr(ch_record, "status", "partial")
                            print(f"[SAVE] Đã lưu một phần nội dung chương {i} (trạng thái: partial).")
                        else:
                            setattr(ch_record, "status", "failed")
                            print(f"[SAVE] Chương {i} bị lỗi hoàn toàn (trạng thái: failed).")
                    else:
                        setattr(ch_record, "content", str(generated_text))
                        setattr(ch_record, "status", "completed")
                        setattr(ch_record, "error_message", None)
                        print(f"[SAVE] Lưu thành công Chương {i} (trạng thái: completed, từ: {final_words}).")
                        
                    save_db.commit()
            except Exception as save_err:
                print(f"[FATAL] Không thể lưu trạng thái vào DB: {save_err}")
                save_db.rollback()
            finally:
                save_db.close()

            # --- TRANSACTION BOUNDARY 3: Cập nhật Rolling Summary (Nếu chương completed) ---
            if final_words >= target_min_words and not error_message:
                summary_db = SessionLocal()
                try:
                    print(f"[PROCESS] Đang cập nhật rolling summary cốt truyện đến hết chương {i}...")
                    
                    # Lấy tất cả nội dung chương completed để sinh summary
                    completed_chapters = summary_db.query(models.Chapter).filter(
                        models.Chapter.project_id == project.id,
                        models.Chapter.status == "completed"
                    ).order_by(models.Chapter.chapter_number.asc()).all()
                    
                    full_content_to_summarize = ""
                    for ch in completed_chapters:
                        full_content_to_summarize += f"\n\nChương {ch.chapter_number}: {ch.title}\n{ch.content}"
                        
                    # Giới hạn nội dung gửi đi tóm tắt để tránh quá tải
                    if len(full_content_to_summarize) > 12000:
                        full_content_to_summarize = full_content_to_summarize[-12000:]
                        
                    summary_prompt = [
                        {"role": "system", "content": "Bạn là chuyên gia tóm tắt cốt truyện sáng tạo. Hãy viết tóm tắt ngắn gọn diễn biến cốt truyện đến hiện tại."},
                        {"role": "user", "content": f"Hãy tóm tắt ngắn gọn diễn biến chính của cốt truyện qua các chương sau bằng tiếng Việt (khoảng 300-500 từ):\n{full_content_to_summarize}"}
                    ]
                    
                    new_summary = call_llm_with_retry(api_key, model_id, summary_prompt, max_tokens=1024)
                    
                    # Lưu rolling summary & tạo context entry
                    proj_record = summary_db.query(models.Project).filter(models.Project.id == project.id).first()
                    if proj_record:
                        setattr(proj_record, "rolling_summary", new_summary)
                        
                        context_entry = models.ProjectContextEntry(
                            project_id=project.id,
                            prompt=instruction,
                            language="vietnamese",
                            generated_content=generated_text[:1000] + "..."
                        )
                        summary_db.add(context_entry)
                        summary_db.commit()
                        print(f"[SUCCESS] Đã cập nhật rolling summary mới thành công.")
                except Exception as sum_err:
                    print(f"[WARN] Cập nhật rolling summary thất bại: {sum_err}")
                finally:
                    summary_db.close()

        print("\n=======================================================")
        print("[ALL DONE] QUY TRÌNH TỰ ĐỘNG SINH TRUYỆN ĐÃ HOÀN TẤT!")
        print(f"Project ID: {project.id}")
        print(f"Mở frontend để verify: https://nt-208-project.vercel.app/")
        print("=======================================================")

    finally:
        db.close()

if __name__ == "__main__":
    main()
