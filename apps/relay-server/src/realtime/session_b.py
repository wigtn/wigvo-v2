"""Session B: 수신자 → User (Inbound Translation).

PRD 3.2:
  Input:  수신자 음성 (targetLanguage) via Twilio
  Process: STT → Translation (target→source) → TTS (optional)
  Output: sourceLanguage 텍스트 → App 자막
  Output: sourceLanguage 음성 → App 스피커 (optional)
"""

import base64
import logging
from typing import Any, Callable, Coroutine

from src.realtime.session_manager import RealtimeSession

logger = logging.getLogger(__name__)


class SessionBHandler:
    """Session B의 이벤트를 처리한다."""

    def __init__(
        self,
        session: RealtimeSession,
        on_translated_audio: Callable[[bytes], Coroutine] | None = None,
        on_caption: Callable[[str, str], Coroutine] | None = None,
        on_recipient_speech_started: Callable[[], Coroutine] | None = None,
        on_recipient_speech_stopped: Callable[[], Coroutine] | None = None,
    ):
        """
        Args:
            session: Session B RealtimeSession
            on_translated_audio: 번역된 음성 콜백 (pcm16 bytes → App에 전달)
            on_caption: 자막 콜백 (role, text → App에 전달)
            on_recipient_speech_started: 수신자 발화 시작 콜백 (First Message / Interrupt)
            on_recipient_speech_stopped: 수신자 발화 종료 콜백
        """
        self.session = session
        self._on_translated_audio = on_translated_audio
        self._on_caption = on_caption
        self._on_recipient_speech_started = on_recipient_speech_started
        self._on_recipient_speech_stopped = on_recipient_speech_stopped
        self._is_recipient_speaking = False

        self._register_handlers()

    def _register_handlers(self) -> None:
        self.session.on("response.audio.delta", self._handle_audio_delta)
        self.session.on("response.audio_transcript.delta", self._handle_transcript_delta)
        self.session.on("response.audio_transcript.done", self._handle_transcript_done)
        self.session.on(
            "input_audio_buffer.speech_started", self._handle_speech_started
        )
        self.session.on(
            "input_audio_buffer.speech_stopped", self._handle_speech_stopped
        )

    @property
    def is_recipient_speaking(self) -> bool:
        return self._is_recipient_speaking

    # --- 수신자 오디오 입력 (Twilio → Session B) ---

    async def send_recipient_audio(self, audio_b64: str) -> None:
        """Twilio에서 받은 수신자 오디오를 Session B에 전달 (g711_ulaw)."""
        await self.session.send_audio(audio_b64)

    # --- 이벤트 핸들러 ---

    async def _handle_audio_delta(self, event: dict[str, Any]) -> None:
        """Session B 번역 음성 → App으로 전달 (pcm16)."""
        delta_b64 = event.get("delta", "")
        if delta_b64 and self._on_translated_audio:
            audio_bytes = base64.b64decode(delta_b64)
            await self._on_translated_audio(audio_bytes)

    async def _handle_transcript_delta(self, event: dict[str, Any]) -> None:
        """번역된 텍스트 스트리밍 → App 자막."""
        delta = event.get("delta", "")
        if delta and self._on_caption:
            await self._on_caption("recipient", delta)

    async def _handle_transcript_done(self, event: dict[str, Any]) -> None:
        """번역 텍스트 완료."""
        transcript = event.get("transcript", "")
        if transcript:
            logger.info("[SessionB] Translation complete: %s", transcript[:80])

    async def _handle_speech_started(self, event: dict[str, Any]) -> None:
        """Server VAD가 수신자 발화 시작을 감지.

        이 이벤트는 First Message Strategy (PRD 3.4)와
        Interrupt 처리 (PRD 3.6)의 핵심 트리거다.
        """
        self._is_recipient_speaking = True
        logger.info("[SessionB] Recipient speech started")
        if self._on_recipient_speech_started:
            await self._on_recipient_speech_started()

    async def _handle_speech_stopped(self, event: dict[str, Any]) -> None:
        """Server VAD가 수신자 발화 종료를 감지."""
        self._is_recipient_speaking = False
        logger.debug("[SessionB] Recipient speech stopped")
        if self._on_recipient_speech_stopped:
            await self._on_recipient_speech_stopped()
