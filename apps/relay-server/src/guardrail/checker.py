"""Guardrail Level 분류 + 파이프라인 (PRD M-2).

텍스트 델타를 분석하여 Level 1/2/3을 분류하고,
각 Level에 맞는 처리를 수행한다.

PRD 텍스트 델타 검사 메커니즘:
  response.text.delta (텍스트 먼저 도착)
    -> Guardrail Checker: 규칙 필터 매칭
      - 매칭 없음 -> Level 1 PASS
      - 반말/비격식 -> Level 2 (비동기 교정)
      - 금지어/욕설 -> Level 3 (TTS 차단)

  response.audio.delta (오디오 약간 후에 도착)
    -> Level 3: Twilio로 전달하지 않음
    -> Level 1-2: Twilio로 정상 전달
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import IntEnum

from src.guardrail.dictionary import get_filler_text
from src.guardrail.fallback_llm import FallbackLLM
from src.guardrail.filter import FilterResult, TextFilter

logger = logging.getLogger(__name__)


class GuardrailLevel(IntEnum):
    """Guardrail 분류 레벨."""
    LEVEL_1 = 1  # 자동 PASS — 추가 처리 없음
    LEVEL_2 = 2  # 의심 구간 — 비동기 검증 (TTS 출력 후 백그라운드 교정)
    LEVEL_3 = 3  # 명확한 오류 — 동기 차단 (필러 오디오 + 교정 후 재전송)


@dataclass
class GuardrailResult:
    """Guardrail 검사 결과."""
    level: GuardrailLevel
    original_text: str
    corrected_text: str = ""
    filler_text: str = ""
    filter_result: FilterResult | None = None
    correction_time_ms: float = 0.0

    @property
    def is_blocked(self) -> bool:
        """Level 3이면 TTS 오디오를 차단해야 한다."""
        return self.level == GuardrailLevel.LEVEL_3

    @property
    def needs_async_correction(self) -> bool:
        """Level 2이면 비동기 교정이 필요하다."""
        return self.level == GuardrailLevel.LEVEL_2


@dataclass
class GuardrailEvent:
    """Guardrail 이벤트 로그 항목 (guardrail_events JSONB)."""
    level: int
    original: str
    corrected: str | None = None
    category: str = ""
    correction_time_ms: float = 0.0
    timestamp: float = 0.0

    def to_dict(self) -> dict:
        return {
            "level": self.level,
            "original": self.original,
            "corrected": self.corrected,
            "category": self.category,
            "correction_time_ms": self.correction_time_ms,
            "timestamp": self.timestamp or time.time(),
        }


class GuardrailChecker:
    """텍스트 델타를 분석하여 Guardrail Level을 분류하고 처리한다.

    PRD: 100자 단위로 규칙 필터 매칭.
    텍스트 델타가 오디오보다 먼저 도착하므로,
    오디오가 Twilio로 전달되기 전에 텍스트를 검사하여 차단할 수 있다.
    """

    def __init__(
        self,
        target_language: str = "ko",
        enabled: bool = True,
    ):
        self._target_language = target_language
        self._enabled = enabled
        self._text_filter = TextFilter(target_language=target_language)
        self._fallback_llm = FallbackLLM()

        # 텍스트 델타 버퍼 (100자 단위 검사)
        self._text_buffer: str = ""
        self._current_level: GuardrailLevel = GuardrailLevel.LEVEL_1

        # 이벤트 로그
        self._events: list[GuardrailEvent] = []

    @property
    def current_level(self) -> GuardrailLevel:
        """현재 응답의 Guardrail 레벨."""
        return self._current_level

    @property
    def is_blocking(self) -> bool:
        """현재 Level 3으로 TTS 차단 중인지."""
        return self._current_level == GuardrailLevel.LEVEL_3

    @property
    def events(self) -> list[dict]:
        """기록된 Guardrail 이벤트 목록 (JSONB 저장용)."""
        return [e.to_dict() for e in self._events]

    def reset(self) -> None:
        """새 응답 시작 시 상태를 초기화한다."""
        self._text_buffer = ""
        self._current_level = GuardrailLevel.LEVEL_1

    def check_text_delta(self, delta: str) -> GuardrailLevel:
        """텍스트 델타를 버퍼에 추가하고 규칙 필터를 실행한다.

        PRD: 100자 단위로 규칙 필터 매칭.
        Level은 항상 상향만 가능 (Level 2 -> Level 3 가능, 역은 불가).

        Returns:
            현재 Guardrail Level
        """
        if not self._enabled:
            return GuardrailLevel.LEVEL_1

        self._text_buffer += delta

        # 100자 단위 검사 또는 문장 끝 감지
        if len(self._text_buffer) >= 100 or delta.rstrip().endswith((".", "!", "?", "요", "다")):
            level = self._classify(self._text_buffer)
            # Level은 상향만 가능
            if level > self._current_level:
                self._current_level = level
                logger.info(
                    "Guardrail level escalated to %d for text: '%s'",
                    level,
                    self._text_buffer[:60],
                )

        return self._current_level

    def check_full_text(self, text: str) -> GuardrailResult:
        """전체 텍스트를 한 번에 검사한다 (응답 완료 시 사용).

        Returns:
            GuardrailResult with level and filter details
        """
        if not self._enabled:
            return GuardrailResult(
                level=GuardrailLevel.LEVEL_1,
                original_text=text,
            )

        filter_result = self._text_filter.check(text)

        if filter_result.has_profanity:
            level = GuardrailLevel.LEVEL_3
        elif filter_result.has_informal:
            level = GuardrailLevel.LEVEL_2
        else:
            level = GuardrailLevel.LEVEL_1

        return GuardrailResult(
            level=level,
            original_text=text,
            filler_text=get_filler_text(self._target_language) if level == GuardrailLevel.LEVEL_3 else "",
            filter_result=filter_result,
        )

    async def correct_text(self, text: str) -> GuardrailResult:
        """Level 3 텍스트를 Fallback LLM으로 교정한다 (동기).

        PRD: 2초 타임아웃, 초과 시 원문 그대로 전달.
        """
        start = time.monotonic()
        result = self.check_full_text(text)

        if result.level == GuardrailLevel.LEVEL_1:
            return result

        corrected = await self._fallback_llm.correct(text, self._target_language)
        elapsed_ms = (time.monotonic() - start) * 1000

        result.corrected_text = corrected
        result.correction_time_ms = elapsed_ms

        # 이벤트 기록
        category = ""
        if result.filter_result:
            categories = {m.category.value for m in result.filter_result.matches}
            category = ",".join(sorted(categories))

        self._events.append(
            GuardrailEvent(
                level=result.level,
                original=text,
                corrected=corrected if corrected != text else None,
                category=category,
                correction_time_ms=elapsed_ms,
            )
        )

        return result

    async def correct_async(self, text: str) -> None:
        """Level 2 텍스트를 비동기로 교정한다 (로그 기록만).

        PRD Level 2: TTS 출력은 일단 Twilio로 전달, 동시에 Fallback LLM에 교정 요청.
        교정 결과가 다르면 로그에 기록 (학습 데이터).
        """
        try:
            result = await self.correct_text(text)
            if result.corrected_text and result.corrected_text != text:
                logger.info(
                    "Async correction (Level 2): '%s' -> '%s' (%.0fms)",
                    text[:60],
                    result.corrected_text[:60],
                    result.correction_time_ms,
                )
        except Exception:
            logger.exception("Async correction failed for: '%s'", text[:60])

    def _classify(self, text: str) -> GuardrailLevel:
        """텍스트를 분석하여 Guardrail Level을 결정한다."""
        filter_result = self._text_filter.check(text)

        if filter_result.has_profanity:
            return GuardrailLevel.LEVEL_3
        elif filter_result.has_informal:
            return GuardrailLevel.LEVEL_2
        else:
            return GuardrailLevel.LEVEL_1
