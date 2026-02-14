"""Session A: User → 수신자 (Outbound Translation).

PRD 3.2:
  Input:  User 음성 (sourceLanguage) 또는 텍스트
  Process: STT → Translation (source→target) → Guardrail → TTS
  Output: targetLanguage 음성 → Twilio → 수신자
  Side:   번역된 텍스트 → App 자막
"""

import base64
import logging
from typing import Any, Callable, Coroutine

from src.realtime.session_manager import RealtimeSession

logger = logging.getLogger(__name__)


class SessionAHandler:
    """Session A의 이벤트를 처리한다."""

    def __init__(
        self,
        session: RealtimeSession,
        on_tts_audio: Callable[[bytes], Coroutine] | None = None,
        on_caption: Callable[[str, str], Coroutine] | None = None,
        on_response_done: Callable[[], Coroutine] | None = None,
    ):
        """
        Args:
            session: Session A RealtimeSession
            on_tts_audio: TTS 오디오 청크 콜백 (g711_ulaw bytes → Twilio로 전달)
            on_caption: 자막 콜백 (role, text → App에 전달)
            on_response_done: 응답 완료 콜백
        """
        self.session = session
        self._on_tts_audio = on_tts_audio
        self._on_caption = on_caption
        self._on_response_done = on_response_done
        self._is_generating = False

        self._register_handlers()

    def _register_handlers(self) -> None:
        self.session.on("response.audio.delta", self._handle_audio_delta)
        self.session.on("response.audio_transcript.delta", self._handle_transcript_delta)
        self.session.on("response.audio_transcript.done", self._handle_transcript_done)
        self.session.on("response.done", self._handle_response_done)
        self.session.on(
            "input_audio_buffer.speech_started", self._handle_user_speech_started
        )
        self.session.on(
            "input_audio_buffer.speech_stopped", self._handle_user_speech_stopped
        )

    @property
    def is_generating(self) -> bool:
        return self._is_generating

    # --- User 음성/텍스트 입력 ---

    async def send_user_audio(self, audio_b64: str) -> None:
        """User 음성 청크를 Session A에 전달 (Relay Mode)."""
        await self.session.send_audio(audio_b64)

    async def commit_user_audio(self) -> None:
        """Client VAD가 발화 종료를 감지하면 오디오를 커밋한다."""
        await self.session.commit_audio()

    async def send_user_text(self, text: str) -> None:
        """User 텍스트를 Session A에 전달 (Agent Mode / Push-to-Talk)."""
        await self.session.send_text(text)

    async def cancel(self) -> None:
        """진행 중인 TTS를 중단한다 (Interrupt)."""
        self._is_generating = False
        await self.session.cancel_response()

    # --- 이벤트 핸들러 ---

    async def _handle_audio_delta(self, event: dict[str, Any]) -> None:
        """Session A TTS 오디오 청크 → Twilio로 전달."""
        self._is_generating = True
        delta_b64 = event.get("delta", "")
        if delta_b64 and self._on_tts_audio:
            audio_bytes = base64.b64decode(delta_b64)
            await self._on_tts_audio(audio_bytes)

    async def _handle_transcript_delta(self, event: dict[str, Any]) -> None:
        """번역된 텍스트 스트리밍 → App 자막."""
        delta = event.get("delta", "")
        if delta and self._on_caption:
            await self._on_caption("assistant", delta)

    async def _handle_transcript_done(self, event: dict[str, Any]) -> None:
        """번역 텍스트 완료."""
        transcript = event.get("transcript", "")
        if transcript:
            logger.info("[SessionA] Translation complete: %s", transcript[:80])

    async def _handle_response_done(self, event: dict[str, Any]) -> None:
        """Session A 응답 완료."""
        self._is_generating = False
        if self._on_response_done:
            await self._on_response_done()

    async def _handle_user_speech_started(self, event: dict[str, Any]) -> None:
        """Server VAD가 User 발화 시작을 감지."""
        logger.debug("[SessionA] User speech started")

    async def _handle_user_speech_stopped(self, event: dict[str, Any]) -> None:
        """Server VAD가 User 발화 종료를 감지."""
        logger.debug("[SessionA] User speech stopped")
