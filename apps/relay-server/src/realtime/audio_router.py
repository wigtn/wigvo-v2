"""오디오 라우터 — Twilio ↔ OpenAI 양방향 오디오 포워딩.

핵심 오디오 흐름 (PRD 3.2):
  User App   ←→  Relay Server  ←→  Twilio (수신자)
                      ↕
               OpenAI Realtime
               (Session A + B)

Session A 경로: User audio → OpenAI → TTS audio → Twilio
Session B 경로: Twilio audio → OpenAI → translated text/audio → User app
"""

import asyncio
import base64
import logging
import time

from src.config import settings
from src.realtime.first_message import FirstMessageHandler
from src.realtime.interrupt_handler import InterruptHandler
from src.realtime.session_a import SessionAHandler
from src.realtime.session_b import SessionBHandler
from src.realtime.session_manager import DualSessionManager
from src.twilio.media_stream import TwilioMediaStreamHandler
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
    ):
        self.call = call
        self.dual_session = dual_session
        self.twilio_handler = twilio_handler
        self._app_ws_send = app_ws_send
        self._call_timer_task: asyncio.Task | None = None

        # Session A 핸들러: User → 수신자
        self.session_a = SessionAHandler(
            session=dual_session.session_a,
            on_tts_audio=self._on_session_a_tts,
            on_caption=self._on_session_a_caption,
            on_response_done=self._on_session_a_done,
        )

        # Session B 핸들러: 수신자 → User
        self.session_b = SessionBHandler(
            session=dual_session.session_b,
            on_translated_audio=self._on_session_b_audio,
            on_caption=self._on_session_b_caption,
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

    async def start(self) -> None:
        """오디오 라우팅을 시작하고 통화 타이머를 설정한다."""
        self.call.started_at = time.time()
        self._call_timer_task = asyncio.create_task(self._call_duration_timer())
        logger.info("AudioRouter started for call %s", self.call.call_id)

    async def stop(self) -> None:
        """오디오 라우팅을 중지한다."""
        if self._call_timer_task:
            self._call_timer_task.cancel()
        logger.info("AudioRouter stopped for call %s", self.call.call_id)

    # --- User App → Session A ---

    async def handle_user_audio(self, audio_b64: str) -> None:
        """User 앱에서 받은 오디오를 Session A로 전달."""
        await self.session_a.send_user_audio(audio_b64)

    async def handle_user_audio_commit(self) -> None:
        """Client VAD 발화 종료 → Session A 커밋."""
        await self.session_a.commit_user_audio()

    async def handle_user_text(self, text: str) -> None:
        """User 텍스트 입력 → Session A (Agent Mode)."""
        await self.session_a.send_user_text(text)

    # --- Twilio → Session B ---

    async def handle_twilio_audio(self, audio_bytes: bytes) -> None:
        """Twilio에서 받은 수신자 오디오를 Session B로 전달."""
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        await self.session_b.send_recipient_audio(audio_b64)

    # --- Session A 콜백: TTS → Twilio ---

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

    # --- Session B 콜백: 번역 → App ---

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
        """Session B의 번역 텍스트를 App 자막으로 전달."""
        await self._app_ws_send(
            WsMessage(
                type=WsMessageType.CAPTION,
                data={"role": role, "text": text, "direction": "inbound"},
            )
        )

    # --- 수신자 발화 감지 (First Message + Interrupt) ---

    async def _on_recipient_started(self) -> None:
        """수신자 발화 시작 → First Message 또는 Interrupt 처리."""
        if not self.call.first_message_sent:
            await self.first_message.on_recipient_speech_detected()
        else:
            await self.interrupt.on_recipient_speech_started()

    async def _on_recipient_stopped(self) -> None:
        """수신자 발화 종료."""
        await self.interrupt.on_recipient_speech_stopped()

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
