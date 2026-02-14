"""Turn Overlap / Interrupt 처리.

PRD 3.6 — Interrupt 우선순위:
  1 (최고): 수신자 발화 — 수신자를 기다리게 하면 안 됨
  2: User 발화 — User가 의도적으로 말하고 있으므로 존중
  3 (최저): AI 생성 (TTS/필러) — 언제든 중단하고 재생성 가능

Case 1: Session A TTS 재생 중 수신자가 끼어들기
  → Session A에 response.cancel + Twilio clear
Case 2: User가 말하는 중 수신자가 끼어들기
  → App에 "상대방이 말하고 있습니다" 알림, User 오디오는 버퍼링 유지
Case 3: Session A/B 동시 출력
  → 독립 경로이므로 병렬 허용
Case 4: Agent Mode에서 수신자 끼어들기
  → Session A response.cancel 후 수신자 발화 처리
"""

import logging
from typing import Callable, Coroutine

from src.realtime.session_a import SessionAHandler
from src.twilio.media_stream import TwilioMediaStreamHandler
from src.types import WsMessage, WsMessageType

logger = logging.getLogger(__name__)


class InterruptHandler:
    """실시간 통화의 Turn Overlap / Interrupt를 처리한다."""

    def __init__(
        self,
        session_a: SessionAHandler,
        twilio_handler: TwilioMediaStreamHandler,
        on_notify_app: Callable[[WsMessage], Coroutine],
    ):
        self.session_a = session_a
        self.twilio_handler = twilio_handler
        self._on_notify_app = on_notify_app
        self._recipient_speaking = False

    async def on_recipient_speech_started(self) -> None:
        """수신자가 말하기 시작했을 때.

        Session A가 TTS를 생성 중이면 즉시 중단한다 (Case 1, 4).
        """
        self._recipient_speaking = True

        if self.session_a.is_generating:
            logger.info("Interrupt: recipient speech while Session A generating — cancelling")
            await self.session_a.cancel()
            await self.twilio_handler.send_clear()

        # App에 알림 (Case 2)
        await self._on_notify_app(
            WsMessage(
                type=WsMessageType.INTERRUPT_ALERT,
                data={"speaking": "recipient"},
            )
        )

    async def on_recipient_speech_stopped(self) -> None:
        """수신자가 말을 멈췄을 때."""
        self._recipient_speaking = False

    @property
    def is_recipient_speaking(self) -> bool:
        return self._recipient_speaking
