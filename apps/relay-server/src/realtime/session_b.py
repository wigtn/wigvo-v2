"""Session B: 수신자 → User (Inbound Translation).

PRD 3.2:
  Input:  수신자 음성 (targetLanguage) via Twilio
  Process: STT → Translation (target→source) → TTS (optional)
  Output: sourceLanguage 텍스트 → App 자막
  Output: sourceLanguage 음성 → App 스피커 (optional)
"""

import base64
import logging
import time
from typing import Any, Callable, Coroutine

from src.realtime.session_manager import RealtimeSession
from src.types import ActiveCall, CostTokens, TranscriptEntry

logger = logging.getLogger(__name__)


class SessionBHandler:
    """Session B의 이벤트를 처리한다."""

    def __init__(
        self,
        session: RealtimeSession,
        call: ActiveCall | None = None,
        on_translated_audio: Callable[[bytes], Coroutine] | None = None,
        on_caption: Callable[[str, str], Coroutine] | None = None,
        on_original_caption: Callable[[str, str], Coroutine] | None = None,
        on_recipient_speech_started: Callable[[], Coroutine] | None = None,
        on_recipient_speech_stopped: Callable[[], Coroutine] | None = None,
        on_transcript_complete: Callable[[str, str], Coroutine] | None = None,
    ):
        """
        Args:
            session: Session B RealtimeSession
            call: ActiveCall 인스턴스 (transcript/cost 추적용)
            on_translated_audio: 번역된 음성 콜백 (pcm16 bytes → App에 전달)
            on_caption: 번역 자막 콜백 (role, text → App에 전달) — 2단계 자막 Stage 2
            on_original_caption: 원문 자막 콜백 (role, text → App에 전달) — 2단계 자막 Stage 1
            on_recipient_speech_started: 수신자 발화 시작 콜백 (First Message / Interrupt)
            on_recipient_speech_stopped: 수신자 발화 종료 콜백
            on_transcript_complete: 번역 완료 콜백 (role, text → 대화 컨텍스트 추적)
        """
        self.session = session
        self._call = call
        self._on_translated_audio = on_translated_audio
        self._on_caption = on_caption
        self._on_original_caption = on_original_caption
        self._on_recipient_speech_started = on_recipient_speech_started
        self._on_recipient_speech_stopped = on_recipient_speech_stopped
        self._on_transcript_complete = on_transcript_complete
        self._is_recipient_speaking = False
        self._output_suppressed = False
        self._pending_output: list[tuple[str, Any]] = []

        self._register_handlers()

    def _register_handlers(self) -> None:
        self.session.on("response.audio.delta", self._handle_audio_delta)
        self.session.on("response.audio_transcript.delta", self._handle_transcript_delta)
        self.session.on("response.audio_transcript.done", self._handle_transcript_done)
        # modalities=['text'] 전용: response.text.delta/done 핸들러
        self.session.on("response.text.delta", self._handle_text_delta)
        self.session.on("response.text.done", self._handle_text_done)
        self.session.on("response.done", self._handle_response_done)
        self.session.on(
            "input_audio_buffer.speech_started", self._handle_speech_started
        )
        self.session.on(
            "input_audio_buffer.speech_stopped", self._handle_speech_stopped
        )
        # 2단계 자막 Stage 1: 수신자 원문 STT (PRD 5.4)
        self.session.on(
            "conversation.item.input_audio_transcription.completed",
            self._handle_input_transcription_completed,
        )

    @property
    def output_suppressed(self) -> bool:
        return self._output_suppressed

    @output_suppressed.setter
    def output_suppressed(self, value: bool) -> None:
        self._output_suppressed = value

    @property
    def is_recipient_speaking(self) -> bool:
        return self._is_recipient_speaking

    # --- 수신자 오디오 입력 (Twilio → Session B) ---

    async def send_recipient_audio(self, audio_b64: str) -> None:
        """Twilio에서 받은 수신자 오디오를 Session B에 전달 (g711_ulaw)."""
        await self.session.send_audio(audio_b64)

    # --- 이벤트 핸들러 ---

    async def clear_input_buffer(self) -> None:
        """에코 잔여물을 제거하기 위해 입력 오디오 버퍼를 비운다."""
        await self.session.clear_input_buffer()

    async def flush_pending_output(self) -> None:
        """억제 해제 후 큐에 저장된 출력을 배출한다."""
        pending = self._pending_output[:]
        self._pending_output.clear()
        for entry_type, data in pending:
            if entry_type == "audio" and self._on_translated_audio:
                await self._on_translated_audio(data)
            elif entry_type == "caption" and self._on_caption:
                await self._on_caption(data[0], data[1])
            elif entry_type == "original_caption" and self._on_original_caption:
                await self._on_original_caption(data[0], data[1])
        if pending:
            logger.debug("[SessionB] Flushed %d pending output items", len(pending))

    def clear_pending_output(self) -> None:
        """억제 중 쌓인 출력을 폐기한다 (에코 환각 제거)."""
        count = len(self._pending_output)
        self._pending_output.clear()
        if count:
            logger.info("[SessionB] Discarded %d pending output items (echo artifacts)", count)

    async def _handle_audio_delta(self, event: dict[str, Any]) -> None:
        """Session B 번역 음성 → App으로 전달 (pcm16). 억제 중이면 큐에 저장."""
        delta_b64 = event.get("delta", "")
        if not delta_b64:
            return
        audio_bytes = base64.b64decode(delta_b64)
        if self._output_suppressed:
            self._pending_output.append(("audio", audio_bytes))
            return
        if self._on_translated_audio:
            await self._on_translated_audio(audio_bytes)

    async def _handle_transcript_delta(self, event: dict[str, Any]) -> None:
        """번역된 텍스트 스트리밍 → App 자막. 억제 중이면 큐에 저장."""
        delta = event.get("delta", "")
        if not delta:
            return
        if self._output_suppressed:
            self._pending_output.append(("caption", ("recipient", delta)))
            return
        if self._on_caption:
            await self._on_caption("recipient", delta)

    async def _handle_text_delta(self, event: dict[str, Any]) -> None:
        """modalities=['text'] 모드: 번역 텍스트 스트리밍 → App 자막.

        response.text.delta는 response.audio_transcript.delta와 동일한
        'delta' 필드를 사용하므로 동일 로직으로 처리한다.
        """
        delta = event.get("delta", "")
        if not delta:
            return
        if self._output_suppressed:
            self._pending_output.append(("caption", ("recipient", delta)))
            return
        if self._on_caption:
            await self._on_caption("recipient", delta)

    async def _handle_transcript_done(self, event: dict[str, Any]) -> None:
        """번역 텍스트 완료 + 양방향 transcript 저장 (억제 중에도 항상 저장)."""
        transcript = event.get("transcript", "")
        if not transcript:
            return
        await self._save_transcript_and_notify(transcript)

    async def _handle_text_done(self, event: dict[str, Any]) -> None:
        """modalities=['text'] 모드: 번역 텍스트 완료.

        Spike 검증 결과: response.text.done은 'text' 필드를 사용한다 (NOT 'transcript').
        """
        text = event.get("text", "")
        if not text:
            return
        await self._save_transcript_and_notify(text)

    async def _save_transcript_and_notify(self, transcript: str) -> None:
        """번역 완료 텍스트를 저장하고 컨텍스트 콜백을 호출한다."""
        logger.info("[SessionB] Translation complete: %s", transcript[:80])

        # 양방향 transcript 저장 — 억제 상태와 무관하게 항상 저장
        if self._call:
            self._call.transcript_bilingual.append(
                TranscriptEntry(
                    role="recipient",
                    original_text=transcript,
                    translated_text=transcript,  # Session B output은 이미 번역된 텍스트
                    language=self._call.target_language,
                    timestamp=time.time(),
                )
            )

        # 대화 컨텍스트 콜백
        if self._on_transcript_complete:
            await self._on_transcript_complete("recipient", transcript)

    async def _handle_response_done(self, event: dict[str, Any]) -> None:
        """Session B 응답 완료 + cost token 추적."""
        if self._call:
            response = event.get("response", {})
            usage = response.get("usage", {})
            if usage:
                input_details = usage.get("input_token_details", {})
                output_details = usage.get("output_token_details", {})
                tokens = CostTokens(
                    audio_input=input_details.get("audio_tokens", 0),
                    text_input=input_details.get("text_tokens", 0),
                    audio_output=output_details.get("audio_tokens", 0),
                    text_output=output_details.get("text_tokens", 0),
                )
                self._call.cost_tokens.add(tokens)
                logger.debug(
                    "[SessionB] Tokens — audio_in=%d text_in=%d audio_out=%d text_out=%d (total=%d)",
                    tokens.audio_input, tokens.text_input,
                    tokens.audio_output, tokens.text_output,
                    self._call.cost_tokens.total,
                )

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

    # --- 2단계 자막 Stage 1: 원문 STT (PRD 5.4) ---

    async def _handle_input_transcription_completed(self, event: dict[str, Any]) -> None:
        """수신자 원문 STT 완료 → 즉시 원문 자막 전송 (2단계 자막 Stage 1).

        OpenAI input_audio_transcription이 활성화된 경우,
        수신자 발화의 원문 텍스트(예: 한국어)를 App에 즉시 전달한다.
        번역 텍스트(Stage 2)는 response.audio_transcript.done에서 별도로 전송된다.
        억제 중이면 큐에 저장하여 나중에 배출한다.
        """
        transcript = event.get("transcript", "")
        if not transcript:
            return
        if self._output_suppressed:
            self._pending_output.append(("original_caption", ("recipient", transcript)))
            return
        logger.info("[SessionB] Original STT (Stage 1): %s", transcript[:80])
        if self._on_original_caption:
            await self._on_original_caption("recipient", transcript)
