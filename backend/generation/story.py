import os
import time

from dotenv import find_dotenv, load_dotenv
from huggingface_hub import InferenceClient


def generate_story_content(
    title: str,
    instruction: str,
    previous_content: str = "",
    language: str = "vietnamese",
    recent_context: str = "",
) -> str:
    generated_content = ""
    try:
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
                "Hãy viết một chương khoảng 2000 từ trở lên.\n"
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
                    {"role": "user", "content": prompt},
                ]

                response = client.chat_completion(
                    model="Qwen/Qwen2.5-7B-Instruct",
                    messages=messages,
                    max_tokens=4000,
                    temperature=0.7,
                    top_p=0.9,
                )

                if response and response.choices:
                    generated_content = str(response.choices[0].message.content).strip()
                else:
                    generated_content = "AI không thể sinh nội dung với cấu hình Prompt này, hoặc model đang quá tải trên Hugging Face."
                break
            except Exception as model_e:
                err_str = str(model_e).lower()
                if "loading" in err_str or "503" in err_str or "unavailable" in err_str or "overloaded" in err_str:
                    if attempt < max_retries - 1:
                        print(f"Server AI đang boot... Đợi 10s rồi thử lại (Lần {attempt + 1}/{max_retries})")
                        time.sleep(10)
                        continue
                raise model_e

    except Exception as e:
        print(f"Lỗi khi gọi Hugging Face API: {e}")
        generated_content = (
            "Xin lỗi, quá trình sinh nội dung bằng Hugging Face bị gián đoạn.\n"
            f"Chi tiết (Model 7B đang cạn tài nguyên trên Inference API lúc này): {str(e)}"
        )

    return generated_content