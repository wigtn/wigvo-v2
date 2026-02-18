"""TextToVoicePipeline — 텍스트 입력 → 음성 출력 파이프라인.

TEXT_TO_VOICE: User 텍스트 → Session A TTS → Twilio + 수신자 음성 → Session B 텍스트 번역 → App

VoiceToVoicePipeline과의 핵심 차이:
  - User 입력: 텍스트 (audio 입력 무시)
  - Session A: per-response instruction override로 번역만 강제
  - Session B: modalities=['text'] (TTS 생략, 토큰 절약)
  - Echo Gate/EchoDetector: 불필요 (텍스트 입력 = TTS echo loop 불가)
  - First Message: exact utterance 패턴 (AI 확장 방지)

hskim-wigvo-test 이식 포인트:
  - sendTextToSessionA → handle_user_text (per-response instruction override)
  - sendExactUtteranceToSessionA → FirstMessageHandler(use_exact_utterance=True)
"""

import asyncio
import base64
import logging
import time
from typing import Any, Callable, Coroutine

from src.config import settings
from src.guardrail.checker import GuardrailChecker
from src.realtime.audio_utils import ulaw_rms as _ulaw_rms
from src.realtime.context_manager import ConversationContextManager
from src.realtime.first_message import FirstMessageHandler
from src.realtime.interrupt_handler import InterruptHandler
from src.realtime.pipeline.base import BasePipeline
from src.realtime.recovery import SessionRecoveryManager
from src.realtime.ring_buffer import AudioRingBuffer
from src.realtime.session_a import SessionAHandler
from src.realtime.session_b import SessionBHandler
from src.realtime.session_manager import DualSessionManager
from src.tools.definitions import get_tools_for_mode
from src.twilio.media_stream import TwilioMediaStreamHandler
from src.types import (
    ActiveCall,
    CallMode,
    WsMessage,
    WsMessageType,
)

logger = logging.getLogger(__name__)


class TextToVoicePipeline(BasePipeline):
    """텍스트 입력 → 음성 출력 파이프라인 (per-response instruction override)."""

    def __init__(
        self,
        call: ActiveCall,
        dual_session: DualSessionManager,
        twilio_handler: TwilioMediaStreamHandler,
        app_ws_send: Callable[[WsMessage], Coroutine[Any, Any, None]],
        prompt_a: str = "",
        prompt_b: str = "",
    ):
        super().__init__(call)
        self.dual_session = dual_session
        self.twilio_handler = twilio_handler
        self._app_ws_send = app_ws_send
        self._call_timer_task: asyncio.Task | None = None
        self._prompt_a = prompt_a
        self._prompt_b = prompt_b

        # 텍스트 전송 직렬화 Lock (race condition 방지)
        self._text_send_lock = asyncio.Lock()

        # Per-response instruction override (hskim 이식)
        self._strict_relay_instruction = (
            f"Translate the user's message from {call.source_language} to "
            f"{call.target_language} and speak ONLY that translated sentence. "
            f"Do NOT answer the question, do NOT add any extra words, "
            f"do NOT ask follow-up questions."
        )

        # Guardrail (PRD Phase 4 / M-2)
        self.guardrail: GuardrailChecker | None = None
        if settings.guardrail_enabled:
            self.guardrail = GuardrailChecker(
                target_language=call.target_language,
                enabled=True,
            )

        # 대화 컨텍스트 매니저 (번역 일관성)
        self.context_manager = ConversationContextManager()

        # Session A 핸들러: User text → 번역 TTS → Twilio
        self.session_a = SessionAHandler(
            session=dual_session.session_a,
            call=call,
            on_tts_audio=self._on_session_a_tts,
            on_caption=self._on_session_a_caption,
            on_response_done=self._on_session_a_done,
            guardrail=self.guardrail,
            on_guardrail_filler=self._on_guardrail_filler,
            on_guardrail_corrected_tts=self._on_guardrail_corrected_tts,
            on_guardrail_event=self._on_guardrail_event,
            on_function_call_result=self._on_function_call_result,
            on_transcript_complete=self._on_turn_complete,
        )

        # Session B 핸들러: 수신자 음성 → 텍스트 번역 → App
        # modalities=['text'] — DualSessionManager가 communication_mode 기반으로 설정
        self.session_b = SessionBHandler(
            session=dual_session.session_b,
            call=call,
            on_translated_audio=self._on_session_b_audio,
            on_caption=self._on_session_b_caption,
            on_original_caption=self._on_session_b_original_caption,
            on_recipient_speech_started=self._on_recipient_started,
            on_recipient_speech_stopped=self._on_recipient_stopped,
            on_transcript_complete=self._on_turn_complete,
        )

        # First Message: exact utterance 패턴 (AI 확장 방지)
        self.first_message = FirstMessageHandler(
            call=call,
            session_a=self.session_a,
            on_notify_app=self._notify_app,
            use_exact_utterance=True,
        )

        # Interrupt 핸들러
        self.interrupt = InterruptHandler(
            session_a=self.session_a,
            twilio_handler=twilio_handler,
            on_notify_app=self._notify_app,
        )

        # Ring Buffer: Session B만 (User audio 없으므로 A 불필요)
        self.ring_buffer_b = AudioRingBuffer(
            capacity=settings.ring_buffer_capacity_slots,
        )

        # Recovery: Session B만 (Session A는 텍스트 입력이므로 audio recovery 불필요)
        tools_a = get_tools_for_mode(call.mode) if call.mode == CallMode.AGENT else None
        self.recovery_a = SessionRecoveryManager(
            session=dual_session.session_a,
            ring_buffer=AudioRingBuffer(capacity=1),  # placeholder (audio recovery 불사용)
            call=call,
            system_prompt=prompt_a,
            on_notify_app=self._notify_app,
            tools=tools_a,
        )
        self.recovery_b = SessionRecoveryManager(
            session=dual_session.session_b,
            ring_buffer=self.ring_buffer_b,
            call=call,
            system_prompt=prompt_b,
            on_notify_app=self._notify_app,
            on_recovered_caption=self._on_session_b_caption,
        )

    async def start(self) -> None:
        self.call.started_at = time.time()
        self._call_timer_task = asyncio.create_task(self._call_duration_timer())
        self.recovery_a.start_monitoring()
        self.recovery_b.start_monitoring()
        logger.info("TextToVoicePipeline started for call %s", self.call.call_id)

    async def stop(self) -> None:
        if self._call_timer_task:
            self._call_timer_task.cancel()
            try:
                await self._call_timer_task
            except asyncio.CancelledError:
                pass

        await self.recovery_a.stop()
        await self.recovery_b.stop()
        logger.info("TextToVoicePipeline stopped for call %s", self.call.call_id)

    # --- User App -> Session A (텍스트 입력) ---

    async def handle_user_audio(self, audio_b64: str) -> None:
        """TextToVoice 모드에서 audio 입력은 무시한다."""
        logger.debug("TextToVoice: ignoring audio input (text-only mode)")

    async def handle_user_audio_commit(self) -> None:
        """TextToVoice 모드에서 audio commit은 무시한다."""
        logger.debug("TextToVoice: ignoring audio commit (text-only mode)")

    async def handle_user_text(self, text: str) -> None:
        """텍스트 입력을 Session A에 per-response instruction override로 전달한다.

        hskim 이식: sendTextToSessionA 패턴
          1. conversation.item.create (텍스트 아이템)
          2. response.create + response.instructions (번역만 강제)

        Lock으로 직렬화하여 여러 텍스트가 동시에 response.create를 호출하는
        race condition (conversation_already_has_active_response)을 방지한다.
        """
        async with self._text_send_lock:
            self.call.transcript_history.append({"role": "user", "text": text})

            if self.session_a.is_generating:
                logger.debug("Waiting for Session A to finish before sending text...")
                await self.session_a.wait_for_done(timeout=5.0)

            await self._app_ws_send(
                WsMessage(
                    type=WsMessageType.TRANSLATION_STATE,
                    data={"state": "processing"},
                )
            )

            await self.context_manager.inject_context(self.dual_session.session_a)

            # Per-response instruction override (Relay mode)
            # Agent mode에서는 기본 instructions 사용
            if self.call.mode == CallMode.RELAY:
                await self.dual_session.session_a.send_text_item(text)
                await self.dual_session.session_a.create_response(
                    instructions=self._strict_relay_instruction,
                )
            else:
                await self.session_a.send_user_text(text)

    # --- Twilio -> Session B ---

    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """수신자 음성을 Session B에 전달한다.

        TextToVoice는 에코 감지 불필요:
        - User 입력이 텍스트이므로 TTS echo loop이 발생하지 않음
        - Audio Energy Gate만 유지 (무음 필터링)
        """
        seq = self.ring_buffer_b.write(audio_bytes)

        if self.recovery_b.is_recovering or self.recovery_b.is_degraded:
            return

        # 오디오 에너지 게이트 (무음 필터링)
        if settings.audio_energy_gate_enabled:
            rms = _ulaw_rms(audio_bytes)
            if rms < settings.audio_energy_min_rms:
                return

        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        await self.session_b.send_recipient_audio(audio_b64)
        self.ring_buffer_b.mark_sent(seq)

    # --- Session A 콜백 ---

    async def _on_session_a_tts(self, audio_bytes: bytes) -> None:
        """Session A TTS 출력을 Twilio에 전달한다.

        TextToVoice는 Echo Gate 불필요 — TTS audio를 직접 전달.
        텍스트 모드에서는 에코 위험이 없으므로 수신자 발화 중에도 TTS를 전달한다.
        (전이중 통화 — 양쪽이 동시에 들을 수 있음)
        """
        await self.twilio_handler.send_audio(audio_bytes)

    async def _on_session_a_caption(self, role: str, text: str) -> None:
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION,
                data={"role": role, "text": text, "direction": "outbound"},
            )
        )

    async def _on_session_a_done(self) -> None:
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.TRANSLATION_STATE,
                data={"state": "done"},
            )
        )

    # --- Session B 콜백 ---

    async def _on_session_b_audio(self, audio_bytes: bytes) -> None:
        """Session B modalities=['text']이므로 audio 콜백은 발생하지 않지만, 안전장치로 유지."""
        logger.debug("TextToVoice: unexpected Session B audio (modalities should be ['text'])")

    async def _on_session_b_caption(self, role: str, text: str) -> None:
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION_TRANSLATED,
                data={
                    "role": role,
                    "text": text,
                    "stage": 2,
                    "language": self.call.source_language,
                    "direction": "inbound",
                },
            )
        )

    async def _on_session_b_original_caption(self, role: str, text: str) -> None:
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION_ORIGINAL,
                data={
                    "role": role,
                    "text": text,
                    "stage": 1,
                    "language": self.call.target_language,
                    "direction": "inbound",
                },
            )
        )

    # --- 수신자 발화 감지 ---

    async def _on_recipient_started(self) -> None:
        """수신자 발화 시작 — Echo Gate 없이 바로 처리."""
        if not self.call.first_message_sent:
            await self.first_message.on_recipient_speech_detected()
        else:
            await self.interrupt.on_recipient_speech_started()

    async def _on_recipient_stopped(self) -> None:
        await self.context_manager.inject_context(self.dual_session.session_b)
        await self.interrupt.on_recipient_speech_stopped()

    # --- 대화 컨텍스트 ---

    async def _on_turn_complete(self, role: str, text: str) -> None:
        self.context_manager.add_turn(role, text)

    # --- Guardrail 콜백 ---

    async def _on_guardrail_filler(self, filler_text: str) -> None:
        logger.info("Guardrail: sending filler to Twilio: '%s'", filler_text)
        await self.twilio_handler.send_clear()

    async def _on_guardrail_corrected_tts(self, corrected_text: str) -> None:
        logger.info("Guardrail: re-generating TTS with corrected text: '%s'", corrected_text[:60])
        await self.dual_session.session_a.send_text(corrected_text)

    async def _on_guardrail_event(self, event_data: dict) -> None:
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.GUARDRAIL_TRIGGERED,
                data=event_data,
            )
        )

    # --- Function Call 결과 ---

    async def _on_function_call_result(self, result: str, data: dict) -> None:
        logger.info("Function call result: %s", result)
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CALL_STATUS,
                data={"status": "call_result", "result": result, "data": data},
            )
        )

    # --- App 알림 ---

    async def _notify_app(self, msg: WsMessage) -> None:
        await self._app_ws_send(msg)

    # --- 통화 시간 제한 ---

    async def _call_duration_timer(self) -> None:
        try:
            warning_s = settings.call_warning_ms / 1000
            max_s = settings.max_call_duration_ms / 1000

            await asyncio.sleep(warning_s)
            await self._notify_app(
                WsMessage(
                    type=WsMessageType.CALL_STATUS,
                    data={"status": "warning", "message": "통화 종료까지 2분 남았습니다."},
                )
            )
            await asyncio.sleep(max_s - warning_s)
            await self._notify_app(
                WsMessage(
                    type=WsMessageType.CALL_STATUS,
                    data={"status": "timeout", "message": "최대 통화 시간을 초과하여 자동 종료됩니다."},
                )
            )
            logger.info("Call %s timed out (max duration reached)", self.call.call_id)
        except asyncio.CancelledError:
            pass
