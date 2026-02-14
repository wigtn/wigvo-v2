"""규칙 기반 텍스트 필터 (PRD M-2).

반말, 욕설, 비격식 표현을 regex + keyword matching으로 감지한다.
결과에 따라 Level 2 (비동기 교정) 또는 Level 3 (동기 차단)을 반환한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

from src.guardrail.dictionary import get_banned_words, get_correction_map


class FilterCategory(str, Enum):
    PROFANITY = "profanity"          # 욕설/비속어 → Level 3
    INFORMAL_ENDING = "informal_ending"  # 반말 어미 → Level 2
    IMPERATIVE = "imperative"        # 명령형 → Level 2
    CASUAL = "casual"                # 비격식 표현 → Level 2


@dataclass
class FilterMatch:
    category: FilterCategory
    matched_text: str
    position: int  # 매칭 위치 (char index)
    suggestion: str = ""


@dataclass
class FilterResult:
    matches: list[FilterMatch] = field(default_factory=list)

    @property
    def has_profanity(self) -> bool:
        return any(m.category == FilterCategory.PROFANITY for m in self.matches)

    @property
    def has_informal(self) -> bool:
        return any(
            m.category in (FilterCategory.INFORMAL_ENDING, FilterCategory.IMPERATIVE, FilterCategory.CASUAL)
            for m in self.matches
        )

    @property
    def is_clean(self) -> bool:
        return len(self.matches) == 0


# --- Korean Safe Phrases (whitelist) ---
# These contain informal-looking endings but are standard polite expressions.
_KO_SAFE_PHRASES = frozenset({
    "안녕하세요", "감사하세요", "수고하세요",
})

# --- Korean Informal Speech Patterns ---
# PRD M-2: 반말 감지 패턴 (~해, ~야, ~냐, ~거든 등 문장 끝)
# 최소 한 글자 이상의 선행 문맥을 요구하여 단독 감탄사와 구별한다.

_KO_INFORMAL_ENDINGS = re.compile(
    r"(?<=\S)(?:해|냐|거든|잖아|인데|건데|할래|줘|줄래|할게|갈게|올게|했어|됐어|없어|있어|먹어|알겠어|몰라|싫어|좋아)(?:[.!?]?\s*$|[.!?]\s)",
    re.MULTILINE,
)

# PRD M-2: 명령형 감지 (~해라, ~하세요 대신 ~해주세요)
# 안녕하세요 등 인사말은 safe phrase로 제외한다.
_KO_IMPERATIVE = re.compile(
    r"(?<=\S)(?:해라|하세요|드세요|가세요|오세요|보세요)(?:[.!?]?\s*$|[.!?]\s)",
    re.MULTILINE,
)


class TextFilter:
    """규칙 기반 텍스트 필터."""

    def __init__(self, target_language: str = "ko"):
        self._target_language = target_language
        self._banned_words = get_banned_words(target_language)
        self._correction_map = get_correction_map(target_language)

    def check(self, text: str) -> FilterResult:
        """텍스트를 검사하고 모든 매칭 결과를 반환한다."""
        result = FilterResult()

        if not text.strip():
            return result

        # 1. 금지어/욕설 매칭 (Level 3)
        self._check_profanity(text, result)

        # 2. 반말 어미 매칭 (Level 2)
        if self._target_language == "ko":
            self._check_informal_endings(text, result)
            self._check_imperative(text, result)

        # 3. 비격식 표현 매칭 (Level 2)
        self._check_casual(text, result)

        return result

    def _check_profanity(self, text: str, result: FilterResult) -> None:
        text_lower = text.lower()
        for word in self._banned_words:
            idx = text_lower.find(word.lower())
            if idx != -1:
                result.matches.append(
                    FilterMatch(
                        category=FilterCategory.PROFANITY,
                        matched_text=word,
                        position=idx,
                    )
                )

    def _check_informal_endings(self, text: str, result: FilterResult) -> None:
        for m in _KO_INFORMAL_ENDINGS.finditer(text):
            result.matches.append(
                FilterMatch(
                    category=FilterCategory.INFORMAL_ENDING,
                    matched_text=m.group(),
                    position=m.start(),
                )
            )

    def _check_imperative(self, text: str, result: FilterResult) -> None:
        for m in _KO_IMPERATIVE.finditer(text):
            # Safe phrase 체크: "안녕하세요" 등은 제외
            start = m.start()
            # 매칭 위치 앞의 문맥을 확인하여 safe phrase에 해당하면 스킵
            context_start = max(0, start - 10)
            context = text[context_start:m.end()].rstrip(".!? ")
            if any(safe in context for safe in _KO_SAFE_PHRASES):
                continue

            matched = m.group().rstrip(".!? ")
            # ~하세요 → ~해주세요 교정 제안
            suggestion = matched.replace("하세요", "해주세요").replace("세요", "주세요")
            result.matches.append(
                FilterMatch(
                    category=FilterCategory.IMPERATIVE,
                    matched_text=m.group(),
                    position=m.start(),
                    suggestion=suggestion,
                )
            )

    def _check_casual(self, text: str, result: FilterResult) -> None:
        for casual, formal in self._correction_map.items():
            idx = text.find(casual)
            if idx != -1:
                # 이미 다른 카테고리에서 같은 위치를 매칭했으면 스킵
                already_matched = any(
                    m.position == idx for m in result.matches
                )
                if not already_matched:
                    result.matches.append(
                        FilterMatch(
                            category=FilterCategory.CASUAL,
                            matched_text=casual,
                            position=idx,
                            suggestion=formal,
                        )
                    )
