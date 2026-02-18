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
from src.realtime.context_manager import ConversationContextManager
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

        # Phase 3: 대화 컨텍스트 매니저 (번역 일관성)
        self.context_manager = ConversationContextManager()

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
            on_transcript_complete=self._on_turn_complete,
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
            on_transcript_complete=self._on_turn_complete,
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

        # Echo Gate: 에코 피드백 루프 차단
        self._echo_suppressed = False
        self._echo_cooldown_task: asyncio.Task | None = None

        # Phase 3: Recovery Managers (PRD 5.3)
        # Agent Mode: Function Calling 도구를 Recovery에 전달하여 재연결 시 복원
        tools_a = get_tools_for_mode(call.mode) if call.mode == CallMode.AGENT else None
        self.recovery_a = SessionRecoveryManager(
            session=dual_session.session_a,
            ring_buffer=self.ring_buffer_a,
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
            try:
                await self._call_timer_task
            except asyncio.CancelledError:
                pass

        # Echo Gate 쿨다운 정리
        if self._echo_cooldown_task and not self._echo_cooldown_task.done():
            self._echo_cooldown_task.cancel()
            try:
                await self._echo_cooldown_task
            except asyncio.CancelledError:
                pass

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
        # Phase 5: 번역 시작 상태 알림
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.TRANSLATION_STATE,
                data={"state": "processing"},
            )
        )
        # Phase 3: 컨텍스트 주입 후 커밋
        await self.context_manager.inject_context(self.dual_session.session_a)
        await self.session_a.commit_user_audio()

    async def handle_user_text(self, text: str) -> None:
        """User 텍스트 입력 -> Session A.

        Relay Mode: 번역 지시를 명시하여 전달 (모델이 대화하지 않고 번역하도록)
        Agent Mode: 텍스트를 그대로 전달

        수신자가 말하는 중이면, 끝날 때까지 대기한다 (턴 겹침 방지).
        """
        self.call.transcript_history.append({"role": "user", "text": text})

        # 수신자가 말하는 중이면 대기 (턴 겹침 방지)
        if self.interrupt.is_recipient_speaking:
            logger.info("Recipient is speaking — holding text until they finish...")
            for _ in range(100):  # 최대 10초 대기
                await asyncio.sleep(0.1)
                if not self.interrupt.is_recipient_speaking:
                    break

        # Session A가 응답 생성 중이면 대기 (충돌 방지)
        if self.session_a.is_generating:
            logger.debug("Waiting for Session A to finish before sending text...")
            for _ in range(50):  # 최대 5초 대기
                await asyncio.sleep(0.1)
                if not self.session_a.is_generating:
                    break
        if self.call.mode == CallMode.RELAY:
            # Relay Mode: 번역으로 명시 전달
            await self.session_a.send_user_text(
                f"[User says in {self.call.source_language}]: {text}"
            )
        else:
            await self.session_a.send_user_text(text)

    # --- Twilio -> Session B ---

    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """Twilio에서 받은 수신자 오디오를 Session B로 전달.

        Echo Gate v2: INPUT은 항상 활성 — 수신자 발화 감지를 위해 오디오를 차단하지 않는다.
        OUTPUT만 SessionB.output_suppressed로 게이팅한다.
        """
        # Phase 3: Ring Buffer B에 기록 (handle_user_audio와 대칭)
        seq = self.ring_buffer_b.write(audio_bytes)

        if self.recovery_b.is_recovering:
            return  # 복구 중에는 버퍼에만 기록

        if self.recovery_b.is_degraded:
            return  # Degraded 모드에서는 버퍼에만 기록

        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        await self.session_b.send_recipient_audio(audio_b64)
        self.ring_buffer_b.mark_sent(seq)

    # --- Session A 콜백: TTS -> Twilio ---

    async def _on_session_a_tts(self, audio_bytes: bytes) -> None:
        """Session A의 TTS 오디오를 Twilio로 전달 + 에코 억제 활성화.

        수신자가 말하는 중이면 TTS를 Twilio에 보내지 않는다 (겹침 방지).
        """
        if self.interrupt.is_recipient_speaking:
            return  # 수신자 발화 중 — TTS 드롭
        self._activate_echo_suppression()
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
        """Session A 응답 완료 → 에코 쿨다운 시작 + 번역 완료 알림."""
        self._start_echo_cooldown()
        # Phase 5: 번역 완료 상태 알림
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.TRANSLATION_STATE,
                data={"state": "done"},
            )
        )

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

    # --- Echo Gate (에코 피드백 루프 차단) ---

    def _activate_echo_suppression(self) -> None:
        """에코 억제를 활성화한다. Session B의 OUTPUT만 억제 (INPUT은 항상 활성)."""
        self._echo_suppressed = True
        self.session_b.output_suppressed = True
        # 기존 쿨다운 타이머 취소 (새 TTS가 시작되면 리셋)
        if self._echo_cooldown_task and not self._echo_cooldown_task.done():
            self._echo_cooldown_task.cancel()
            self._echo_cooldown_task = None

    def _start_echo_cooldown(self) -> None:
        """응답 완료 후 쿨다운 타이머를 시작한다."""
        if self._echo_cooldown_task and not self._echo_cooldown_task.done():
            self._echo_cooldown_task.cancel()
        self._echo_cooldown_task = asyncio.create_task(self._echo_cooldown_timer())

    async def _echo_cooldown_timer(self) -> None:
        """쿨다운 대기 후 에코 억제를 해제하고 큐에 저장된 출력을 배출한다."""
        try:
            await asyncio.sleep(settings.echo_gate_cooldown_s)
            self._echo_suppressed = False
            self.session_b.output_suppressed = False
            await self.session_b.flush_pending_output()
            logger.debug("Echo gate released after %.1fs cooldown", settings.echo_gate_cooldown_s)
        except asyncio.CancelledError:
            pass

    # --- 수신자 발화 감지 (First Message + Interrupt) ---

    async def _on_recipient_started(self) -> None:
        """수신자 발화 시작 -> Echo Gate 즉시 해제 + First Message 또는 Interrupt 처리."""
        # Echo Gate v2: 억제 중 수신자 발화 감지 시 즉시 게이트 해제
        if self._echo_suppressed:
            logger.info("Recipient speech during echo suppression — releasing gate immediately")
            self._echo_suppressed = False
            self.session_b.output_suppressed = False
            if self._echo_cooldown_task and not self._echo_cooldown_task.done():
                self._echo_cooldown_task.cancel()
                self._echo_cooldown_task = None
            await self.session_b.flush_pending_output()

        if not self.call.first_message_sent:
            await self.first_message.on_recipient_speech_detected()
        else:
            await self.interrupt.on_recipient_speech_started()

    async def _on_recipient_stopped(self) -> None:
        """수신자 발화 종료 + 컨텍스트 주입."""
        # Phase 3: Session B에 대화 컨텍스트 주입 (다음 번역 일관성)
        await self.context_manager.inject_context(self.dual_session.session_b)
        await self.interrupt.on_recipient_speech_stopped()

    # --- 대화 컨텍스트 콜백 (Phase 3) ---

    async def _on_turn_complete(self, role: str, text: str) -> None:
        """양쪽 세션의 완료된 번역을 대화 컨텍스트에 추가.

        Agent Mode: 수신자 번역이 완료되면 Session A에 전달하여
        AI가 다음 응답을 자동 생성하도록 한다 (피드백 루프).
        """
        self.context_manager.add_turn(role, text)

        # Agent Mode 피드백 루프: Session B 번역 → Session A
        if role == "recipient" and self.call.mode == CallMode.AGENT:
            await self._forward_recipient_to_session_a(text)

    async def _forward_recipient_to_session_a(self, text: str) -> None:
        """Agent Mode: 수신자의 번역된 발화를 Session A에 전달."""
        # Recovery 컨텍스트를 위해 transcript_history에 기록
        self.call.transcript_history.append({"role": "recipient", "text": text})

        if self.session_a.is_generating:
            logger.debug("Waiting for Session A before forwarding recipient translation...")
            for _ in range(50):  # 최대 5초
                await asyncio.sleep(0.1)
                if not self.session_a.is_generating:
                    break

        logger.info("Agent Mode: forwarding recipient translation to Session A: %s", text[:80])
        await self.session_a.send_user_text(f"[Recipient says]: {text}")

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
