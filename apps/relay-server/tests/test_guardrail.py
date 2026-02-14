"""Guardrail Level classification + correction tests."""

import pytest
from src.guardrail.checker import GuardrailChecker, GuardrailLevel
from src.guardrail.filter import TextFilter, FilterCategory
from src.guardrail.dictionary import get_banned_words, get_filler_text


class TestTextFilter:
    def test_clean_text_passes(self):
        """Clean polite text has no matches."""
        f = TextFilter(target_language="ko")
        result = f.check("안녕하세요, 예약 확인 부탁드립니다.")
        assert result.is_clean

    def test_profanity_detected(self):
        """Profanity is detected as Level 3."""
        f = TextFilter(target_language="ko")
        result = f.check("이 씨발 뭐야")
        assert result.has_profanity
        assert any(m.category == FilterCategory.PROFANITY for m in result.matches)

    def test_informal_ending_detected(self):
        """Informal endings are detected as Level 2."""
        f = TextFilter(target_language="ko")
        result = f.check("그거 알겠어")
        assert result.has_informal

    def test_safe_phrases_not_flagged(self):
        """Safe phrases like 'hello' are not flagged."""
        f = TextFilter(target_language="ko")
        result = f.check("안녕하세요")
        # 안녕하세요 should be safe
        profanity_matches = [m for m in result.matches if m.category == FilterCategory.PROFANITY]
        assert len(profanity_matches) == 0


class TestGuardrailChecker:
    def test_level_1_clean_text(self):
        """Clean text is Level 1."""
        gc = GuardrailChecker(target_language="ko")
        level = gc.check_text_delta("감사합니다. 예약이 확인되었습니다.")
        assert level == GuardrailLevel.LEVEL_1

    def test_level_escalation_only_upward(self):
        """Level can only escalate upward, not downward."""
        gc = GuardrailChecker(target_language="ko")
        # End with "요" to trigger buffer flush for classification
        gc.check_text_delta("이거 알겠어요")  # Level 2 trigger (informal ending "알겠어" in casual map)
        assert gc.current_level >= GuardrailLevel.LEVEL_2

        gc.check_text_delta("감사합니다.")  # Clean text
        # Level stays at 2+ (cannot go down)
        assert gc.current_level >= GuardrailLevel.LEVEL_2

    def test_reset_clears_level(self):
        """reset() resets to Level 1."""
        gc = GuardrailChecker(target_language="ko")
        # End with "다" to trigger buffer flush; "씨발" is a banned word (Level 3)
        gc.check_text_delta("씨발이다")
        assert gc.current_level == GuardrailLevel.LEVEL_3

        gc.reset()
        assert gc.current_level == GuardrailLevel.LEVEL_1

    def test_blocking_on_level_3(self):
        """Level 3 means is_blocking = True."""
        gc = GuardrailChecker(target_language="ko")
        # End with "?" to trigger buffer flush; "씨발" is a banned word (Level 3)
        gc.check_text_delta("이 씨발 뭐야?")
        assert gc.is_blocking

    def test_disabled_always_level_1(self):
        """When disabled, always returns Level 1."""
        gc = GuardrailChecker(target_language="ko", enabled=False)
        level = gc.check_text_delta("씨발")
        assert level == GuardrailLevel.LEVEL_1


class TestDictionary:
    def test_korean_banned_words_exist(self):
        """Korean banned words list exists."""
        words = get_banned_words("ko")
        assert len(words) > 0
        assert "씨발" in words

    def test_filler_text_per_language(self):
        """Filler text is defined per language."""
        assert get_filler_text("ko") == "잠시만요."
        assert get_filler_text("en") == "One moment, please."
        assert get_filler_text("ja") == "少々お待ちください。"
