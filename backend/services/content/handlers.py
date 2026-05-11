import re
from typing import Protocol

from services.content.types import ExecutionPlan


class ContentHandler(Protocol):
    subtype: str

    def render(self, plan: ExecutionPlan, prompt: str) -> str:
        ...


def _render_count_sequence(prompt: str) -> str | None:
    count_match = re.search(
        r"(đếm(?: từ)?|count(?: from)?)\s*(-?\d+)\s*(?:đến|to|-)\s*(-?\d+)",
        prompt,
        flags=re.IGNORECASE,
    )
    if not count_match:
        return None
    start = int(count_match.group(2))
    end = int(count_match.group(3))
    step = 1 if end >= start else -1
    sequence = [str(n) for n in range(start, end + step, step)]
    return "\n".join(sequence)


def _clean_candidate_text(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = cleaned.strip("`\"'“”")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _extract_text_for_speech(prompt: str) -> str | None:
    # 1) If user wraps target text in quotes, prioritize it.
    quote_match = re.search(r"[\"“']([^\"”']{2,})[\"”']", prompt)
    if quote_match:
        return _clean_candidate_text(quote_match.group(1))

    # 2) Common "content:" style directives.
    markers = [
        r"nội dung(?: cần đọc)?",
        r"văn bản(?: cần đọc)?",
        r"text(?: to speech)?",
        r"content",
        r"đoạn (?:sau|sau đây)",
    ]
    marker_pattern = r"(?:%s)\s*[:\-]\s*(.+)$" % "|".join(markers)
    marker_match = re.search(marker_pattern, prompt, flags=re.IGNORECASE)
    if marker_match:
        return _clean_candidate_text(marker_match.group(1))

    # 3) Verb-based extraction: "hãy đọc/nói ...".
    verb_match = re.search(
        r"(?:đọc|nói|read|say|speak)\s+(?:giúp|giùm|hộ)?\s*(?:mình|tôi)?\s*(.+)$",
        prompt,
        flags=re.IGNORECASE,
    )
    if verb_match:
        candidate = _clean_candidate_text(verb_match.group(1))
        candidate = re.sub(
            r"^(?:với|bằng)\s+(?:giọng|voice)[^,:;.!?]*[,:;\-]?\s*",
            "",
            candidate,
            flags=re.IGNORECASE,
        )
        candidate = re.sub(r"^(?:rằng|là)\s+", "", candidate, flags=re.IGNORECASE)
        if candidate:
            return candidate

    # 4) If prompt looks mostly like instructions, do not read them verbatim.
    instruction_like = re.search(
        r"(?:bắt chước|giọng|voice|phong cách|style|tone|ngữ điệu)",
        prompt,
        flags=re.IGNORECASE,
    )
    if instruction_like:
        return None
    return _clean_candidate_text(prompt)


class SpeechHandler:
    subtype = "speech"

    def render(self, plan: ExecutionPlan, prompt: str) -> str:
        prompt_clean = (prompt or "").strip()
        counted = _render_count_sequence(prompt_clean)
        if counted is not None:
            return counted
        extracted = _extract_text_for_speech(prompt_clean)
        if extracted:
            return extracted
        return "Xin chao ban, day la noi dung audio duoc tao tu prompt."


class SfxHandler:
    subtype = "sfx"

    def render(self, plan: ExecutionPlan, prompt: str) -> str:
        duration_hint = str(plan.get("constraints", {}).get("duration", "auto")).lower()
        repeat = 8
        secs = re.search(r"(\d+)\s*s", duration_hint)
        if secs:
            repeat = max(4, min(30, int(secs.group(1)) * 2))
        return " ".join(["haha"] * repeat)


class SongHandler:
    subtype = "song"

    def render(self, plan: ExecutionPlan, prompt: str) -> str:
        return (
            "Trong đêm yên, ta hát lên\n"
            "Theo nhịp tim, sáng dịu êm\n"
            "Giữ nụ cười qua gió mưa\n"
            "Ngày mai đến, lòng vẫn thơ"
        )


DEFAULT_HANDLERS: tuple[ContentHandler, ...] = (SpeechHandler(), SfxHandler(), SongHandler())

