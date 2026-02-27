"""금지어/교정 사전 (Guardrail Dictionary).

PRD M-2: 규칙 기반 필터에서 사용하는 금지어 목록과 교정 매핑.
Per-language dictionaries (Korean, English, Japanese, Chinese).
"""

from __future__ import annotations


# --- 금지어 사전 (Banned Words) ---
# Level 3 trigger: 욕설, 비속어, 심각한 부적절 표현
# 이 단어가 감지되면 TTS 차단 + 동기 교정

BANNED_WORDS: dict[str, list[str]] = {
    "ko": [
        "씨발", "시발", "ㅅㅂ", "ㅆㅂ",
        "개새끼", "ㄱㅅㄲ",
        "병신", "ㅂㅅ",
        "지랄", "ㅈㄹ",
        "좆", "ㅈ같",
        "미친놈", "미친년",
        "꺼져", "닥쳐",
        "죽어", "뒤져",
    ],
    "en": [
        "fuck", "shit", "damn", "bitch", "asshole",
        "bastard", "crap", "dick", "piss",
    ],
    "ja": [
        "くそ", "クソ", "バカ", "馬鹿",
        "死ね", "うざい", "きもい",
    ],
    "zh": [
        "他妈", "妈的", "操", "草",
        "傻逼", "狗屎", "混蛋",
    ],
}


# --- 위협/차별 사전 (Threat & Discrimination Phrases) ---
# Level 3 trigger: 협박, 위협, 차별적 비하 표현
# 번역기를 통해 상대방에게 전달되면 안 되는 수준의 유해 표현

THREAT_PHRASES: dict[str, list[str]] = {
    "ko": [
        # 위협/협박
        "죽이겠", "죽여버", "죽여줄",
        "패버리", "때리겠", "때려버",
        "가만 안 두", "가만 안 놔", "가만두지 않",
        # 신고/고소 위협
        "경찰 부를", "경찰 불러", "경찰 신고",
        "신고하겠", "신고해버",
        "고소하겠", "고소해버", "고발하겠",
        # 차별적 비하 (인종/지역)
        "짱깨", "쪽바리", "깜둥이",
        "홍어",
        "느금마",
    ],
    "en": [
        "kill you", "beat you up",
        "call the cops on you", "call the police on you",
        "report you to immigration",
        "go back to your country",
    ],
    "ja": [
        "殺す", "ぶっ殺す",
        "通報する", "警察呼ぶ",
    ],
    "zh": [
        "杀了你", "打死你",
        "报警", "举报你",
    ],
}


# --- 교정 매핑 (Correction Mappings) ---
# Level 2 trigger: 반말/비격식 → 존댓말/격식 변환
# 이 패턴이 감지되면 비동기 교정 (TTS는 그대로 전달)

CORRECTION_MAP: dict[str, dict[str, str]] = {
    "ko": {
        "뭐야": "무엇인가요",
        "왜": "왜요",  # 단독 사용 시
        "알겠어": "알겠습니다",
        "고마워": "감사합니다",
        "미안해": "죄송합니다",
        "그래": "네, 그렇습니다",
        "응": "네",
        "어": "네",
        "됐어": "되었습니다",
        "몰라": "모르겠습니다",
        "싫어": "곤란합니다",
        "줘": "주세요",
        "해줘": "해주세요",
        "할게": "하겠습니다",
        "갈게": "가겠습니다",
        "올게": "오겠습니다",
        "있어": "있습니다",
        "없어": "없습니다",
        "했어": "했습니다",
        "먹어": "드세요",
    },
    "en": {},
    "ja": {
        "やって": "お願いします",
        "ちょうだい": "ください",
    },
    "zh": {},
}


# --- 필러 오디오 텍스트 (Filler Audio Text) ---
# Level 3 시 수신자에게 재생할 "잠시만요" 메시지

FILLER_TEXT: dict[str, str] = {
    "ko": "잠시만요.",
    "en": "One moment, please.",
    "ja": "少々お待ちください。",
    "zh": "请稍等。",
}


def get_banned_words(language: str) -> list[str]:
    """특정 언어의 금지어 목록을 반환한다."""
    return BANNED_WORDS.get(language, [])


def get_threat_phrases(language: str) -> list[str]:
    """특정 언어의 위협/차별 표현 목록을 반환한다."""
    return THREAT_PHRASES.get(language, [])


def get_correction_map(language: str) -> dict[str, str]:
    """특정 언어의 교정 매핑을 반환한다."""
    return CORRECTION_MAP.get(language, {})


def get_filler_text(language: str) -> str:
    """특정 언어의 필러 텍스트를 반환한다.

    미지원 언어는 영어로 fallback (한국어보다 범용적).
    """
    return FILLER_TEXT.get(language, FILLER_TEXT["en"])
