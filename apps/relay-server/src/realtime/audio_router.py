"""오디오 라우터 -- Twilio <-> OpenAI 양방향 오디오 포워딩.

핵심 오디오 흐름 (PRD 3.2):
  User App   <->  Relay Server  <->  Twilio (수신자)
                      |
               OpenAI Realtime
               (Session A + B)

Session A 경로: User audio -> OpenAI -> Guardrail -> TTS audio -> Twilio
Session B 경로: Twilio audio -> OpenAI -> translated text/audio -> User app

Phase 3 추가 (PRD 5.1-5.3):
  - Ring Buffer: Twilio 오디오를 항상 기록 (30초)
  - Recovery: Session 장애 시 자동 재연결 + catch-up
  - Degraded Mode: 복구 실패 시 Whisper batch STT fallback
"""

import asyncio
import base64
import logging
import time

from src.config import settings
from src.guardrail.checker import GuardrailChecker
from src.realtime.first_message import FirstMessageHandler
from src.realtime.interrupt_handler import InterruptHandler
from src.realtime.recovery import SessionRecoveryManager
from src.realtime.ring_buffer import AudioRingBuffer
from src.realtime.session_a import SessionAHandler
from src.realtime.session_b import SessionBHandler
from src.realtime.session_manager import DualSessionManager
from src.twilio.media_stream import TwilioMediaStreamHandler
from src.tools.definitions import get_tools_for_mode
from src.types import ActiveCall, CallMode, WsMessage, WsMessageType

logger = logging.getLogger(__name__)


class AudioRouter:
    """모든 오디오 흐름을 관리하는 중앙 라우터."""

    def __init__(
        self,
        call: ActiveCall,
        dual_session: DualSessionManager,
        twilio_handler: TwilioMediaStreamHandler,
        app_ws_send: asyncio.coroutines,  # App WebSocket으로 메시지 전송 함수
        prompt_a: str = "",
        prompt_b: str = "",
    ):
        self.call = call
        self.dual_session = dual_session
        self.twilio_handler = twilio_handler
        self._app_ws_send = app_ws_send
        self._call_timer_task: asyncio.Task | None = None
        self._prompt_a = prompt_a
        self._prompt_b = prompt_b

        # Guardrail (PRD Phase 4 / M-2)
        self.guardrail: GuardrailChecker | None = None
        if settings.guardrail_enabled:
            self.guardrail = GuardrailChecker(
                target_language=call.target_language,
                enabled=True,
            )

        # Session A 핸들러: User -> 수신자
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
        )

        # Session B 핸들러: 수신자 -> User
        self.session_b = SessionBHandler(
            session=dual_session.session_b,
            call=call,
            on_translated_audio=self._on_session_b_audio,
            on_caption=self._on_session_b_caption,
            on_original_caption=self._on_session_b_original_caption,
            on_recipient_speech_started=self._on_recipient_started,
            on_recipient_speech_stopped=self._on_recipient_stopped,
        )

        # First Message 핸들러 (PRD 3.4)
        self.first_message = FirstMessageHandler(
            call=call,
            session_a=self.session_a,
            on_notify_app=self._notify_app,
        )

        # Interrupt 핸들러 (PRD 3.6)
        self.interrupt = InterruptHandler(
            session_a=self.session_a,
            twilio_handler=twilio_handler,
            on_notify_app=self._notify_app,
        )

        # Phase 3: Ring Buffers (PRD 5.2)
        self.ring_buffer_a = AudioRingBuffer(
            capacity=settings.ring_buffer_capacity_slots,
        )
        self.ring_buffer_b = AudioRingBuffer(
            capacity=settings.ring_buffer_capacity_slots,
        )

        # Phase 3: Recovery Managers (PRD 5.3)
        self.recovery_a = SessionRecoveryManager(
            session=dual_session.session_a,
            ring_buffer=self.ring_buffer_a,
            call=call,
            system_prompt=prompt_a,
            on_notify_app=self._notify_app,
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
        """오디오 라우팅을 시작하고 통화 타이머를 설정한다."""
        self.call.started_at = time.time()
        self._call_timer_task = asyncio.create_task(self._call_duration_timer())

        # Phase 3: Recovery 모니터링 시작
        self.recovery_a.start_monitoring()
        self.recovery_b.start_monitoring()

        logger.info("AudioRouter started for call %s", self.call.call_id)

    async def stop(self) -> None:
        """오디오 라우팅을 중지한다."""
        if self._call_timer_task:
            self._call_timer_task.cancel()

        # Phase 3: Recovery 중지
        await self.recovery_a.stop()
        await self.recovery_b.stop()

        logger.info("AudioRouter stopped for call %s", self.call.call_id)

    # --- User App -> Session A ---

    async def handle_user_audio(self, audio_b64: str) -> None:
        """User 앱에서 받은 오디오를 Session A로 전달."""
        # Phase 3: Ring Buffer에 기록
        audio_bytes = base64.b64decode(audio_b64)
        seq = self.ring_buffer_a.write(audio_bytes)

        if self.recovery_a.is_recovering:
            return  # 복구 중에는 버퍼에만 기록

        if self.recovery_a.is_degraded:
            transcript = await self.recovery_a.process_degraded_audio(audio_bytes)
            if transcript:
                await self._on_session_a_caption("user", f"[지연] {transcript}")
            return

        await self.session_a.send_user_audio(audio_b64)
        self.ring_buffer_a.mark_sent(seq)

    async def handle_user_audio_commit(self) -> None:
        """Client VAD 발화 종료 -> Session A 커밋."""
        if self.recovery_a.is_recovering or self.recovery_a.is_degraded:
            return
        await self.session_a.commit_user_audio()

    async def handle_user_text(self, text: str) -> None:
        """User 텍스트 입력 -> Session A (Agent Mode)."""
        self.call.transcript_history.append({"role": "user", "text": text})
        await self.session_a.send_user_text(text)

    # --- Twilio -> Session B ---

    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """Twilio에서 받은 수신자 오디오를 Session B로 전달."""
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        await self.session_b.send_recipient_audio(audio_b64)

    # --- Session A 콜백: TTS -> Twilio ---

    async def _on_session_a_tts(self, audio_bytes: bytes) -> None:
        """Session A의 TTS 오디오를 Twilio로 전달."""
        await self.twilio_handler.send_audio(audio_bytes)

    async def _on_session_a_caption(self, role: str, text: str) -> None:
        """Session A의 번역 텍스트를 App 자막으로 전달."""
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION,
                data={"role": role, "text": text, "direction": "outbound"},
            )
        )

    async def _on_session_a_done(self) -> None:
        """Session A 응답 완료."""
        pass

    # --- Session B 콜백: 번역 -> App ---

    async def _on_session_b_audio(self, audio_bytes: bytes) -> None:
        """Session B의 번역 음성을 App으로 전달."""
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.RECIPIENT_AUDIO,
                data={"audio": audio_b64},
            )
        )

    async def _on_session_b_caption(self, role: str, text: str) -> None:
        """Session B 번역 자막 — 2단계 자막 Stage 2."""
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION_TRANSLATED,
                data={
                    "role": role,
                    "text": text,
                    "stage": 2,
                    "language": self.call.source_language,  # translated to user's language
                    "direction": "inbound",
                },
            )
        )

    async def _on_session_b_original_caption(self, role: str, text: str) -> None:
        """Session B 원문 자막 (즉시 전송) — 2단계 자막 Stage 1."""
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION_ORIGINAL,
                data={
                    "role": role,
                    "text": text,
                    "stage": 1,
                    "language": self.call.target_language,  # original language of recipient
                    "direction": "inbound",
                },
            )
        )

    # --- 수신자 발화 감지 (First Message + Interrupt) ---

    async def _on_recipient_started(self) -> None:
        """수신자 발화 시작 -> First Message 또는 Interrupt 처리."""
        if not self.call.first_message_sent:
            await self.first_message.on_recipient_speech_detected()
        else:
            await self.interrupt.on_recipient_speech_started()

    async def _on_recipient_stopped(self) -> None:
        """수신자 발화 종료."""
        await self.interrupt.on_recipient_speech_stopped()

    # --- Guardrail 콜백 (PRD Phase 4 / M-2) ---

    async def _on_guardrail_filler(self, filler_text: str) -> None:
        """Level 3: 필러 오디오 재생 ("잠시만요").

        수신자에게 대기 메시지를 전달한다.
        교정이 완료될 때까지 수신자가 기다리게 한다.
        """
        logger.info("Guardrail: sending filler to Twilio: '%s'", filler_text)
        # Twilio clear: 차단된 오디오 버퍼 비우기
        await self.twilio_handler.send_clear()
        # TODO: 프리레코딩된 필러 오디오 파일 재생 (Phase 4 확장)
        # 현재는 OpenAI Realtime API의 conversation.item.create로 TTS 생성
        # 이 방법은 추가 지연이 있으므로, 프리레코딩 파일이 더 적합

    async def _on_guardrail_corrected_tts(self, corrected_text: str) -> None:
        """Level 3 교정 완료: 교정된 텍스트를 Session A에 주입하여 재TTS.

        교정된 텍스트를 OpenAI Realtime에 다시 보내서 새 TTS를 생성한다.
        """
        logger.info("Guardrail: re-generating TTS with corrected text: '%s'", corrected_text[:60])
        await self.dual_session.session_a.send_text(corrected_text)

    async def _on_guardrail_event(self, event_data: dict) -> None:
        """Guardrail 이벤트를 App에 알림 (디버그용).

        PRD 8.2: guardrail.triggered 이벤트.
        """
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.GUARDRAIL_TRIGGERED,
                data=event_data,
            )
        )

    # --- Function Call 결과 (Agent Mode) ---

    async def _on_function_call_result(self, result: str, data: dict) -> None:
        """Function Call 통화 결과 판정 → App에 알림."""
        logger.info("Function call result: %s", result)
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CALL_STATUS,
                data={
                    "status": "call_result",
                    "result": result,
                    "data": data,
                },
            )
        )

    # --- App 알림 ---

    async def _notify_app(self, msg: WsMessage) -> None:
        """App에 상태 알림을 전달한다."""
        await self._app_ws_send(msg)

    # --- 통화 시간 제한 (M-3) ---

    async def _call_duration_timer(self) -> None:
        """최대 통화 시간 모니터링 (10분 제한, 8분 경고)."""
        try:
            warning_s = settings.call_warning_ms / 1000
            max_s = settings.max_call_duration_ms / 1000

            await asyncio.sleep(warning_s)
            # 8분 경고
            await self._notify_app(
                WsMessage(
                    type=WsMessageType.CALL_STATUS,
                    data={
                        "status": "warning",
                        "message": "통화 종료까지 2분 남았습니다.",
                    },
                )
            )

            await asyncio.sleep(max_s - warning_s)
            # 10분 자동 종료
            await self._notify_app(
                WsMessage(
                    type=WsMessageType.CALL_STATUS,
                    data={
                        "status": "timeout",
                        "message": "최대 통화 시간을 초과하여 자동 종료됩니다.",
                    },
                )
            )
            logger.info("Call %s timed out (max duration reached)", self.call.call_id)

        except asyncio.CancelledError:
            pass
