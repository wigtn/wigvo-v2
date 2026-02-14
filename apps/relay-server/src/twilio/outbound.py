"""Twilio outbound call — REST API를 사용하여 전화 발신."""

import logging

from twilio.rest import Client

from src.config import settings

logger = logging.getLogger(__name__)


def get_twilio_client() -> Client:
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


def make_call(
    phone_number: str,
    call_id: str,
) -> str:
    """Twilio REST API로 아웃바운드 콜을 발신하고 call_sid를 반환한다.

    통화 시작 시퀀스 (PRD 3.1):
      1. App → Relay Server: POST /relay/calls/start
      2. Relay Server: Twilio REST API로 발신  ← 여기
      3. Twilio → Relay Server: webhook (TwiML 응답)
      4. Twilio → Relay Server: Media Stream WebSocket
    """
    client = get_twilio_client()

    webhook_url = f"{settings.relay_server_url}/twilio/webhook/{call_id}"
    status_callback_url = (
        f"{settings.relay_server_url}/twilio/status-callback/{call_id}"
    )

    logger.info("Making outbound call to %s (call_id=%s)", phone_number, call_id)

    call = client.calls.create(
        to=phone_number,
        from_=settings.twilio_phone_number,
        url=webhook_url,
        status_callback=status_callback_url,
        status_callback_event=["initiated", "ringing", "answered", "completed"],
        timeout=settings.recipient_answer_timeout_s,
    )

    logger.info("Twilio call created: sid=%s", call.sid)
    return call.sid
