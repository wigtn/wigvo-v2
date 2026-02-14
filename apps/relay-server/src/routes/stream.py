"""WebSocket 스트리밍 엔드포인트.

두 가지 WebSocket 연결을 처리한다:

1. App ↔ Relay Server: /relay/calls/{call_id}/stream
   - App에서 User 오디오/텍스트를 수신
   - App으로 자막/번역 오디오/상태 알림을 전송

2. Twilio ↔ Relay Server: /twilio/media-stream/{call_id}
   - Twilio Media Stream에서 수신자 오디오를 수신
   - Twilio로 TTS 오디오를 전송
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.realtime.audio_router import AudioRouter
from src.realtime.session_manager import DualSessionManager
from src.twilio.media_stream import TwilioMediaStreamHandler
from src.types import WsMessage, WsMessageType

router = APIRouter(tags=["stream"])
logger = logging.getLogger(__name__)

# DualSessionManager 인스턴스를 call별로 저장
_sessions: dict[str, DualSessionManager] = {}
_routers: dict[str, AudioRouter] = {}


@router.websocket("/calls/{call_id}/stream")
async def app_websocket(ws: WebSocket, call_id: str):
    """App ↔ Relay Server WebSocket 연결.

    User의 오디오/텍스트를 받아 Session A로 전달하고,
    Session B의 번역 결과를 App으로 전달한다.
    """
    from src.main import active_calls

    await ws.accept()
    logger.info("App WebSocket connected (call=%s)", call_id)

    call = active_calls.get(call_id)
    if not call:
        await ws.send_json(
            WsMessage(
                type=WsMessageType.ERROR,
                data={"message": "Call not found"},
            ).model_dump()
        )
        await ws.close()
        return

    # AudioRouter가 있으면 연결
    audio_router = _routers.get(call_id)

    async def send_to_app(msg: WsMessage) -> None:
        try:
            await ws.send_json(msg.model_dump())
        except Exception:
            pass

    # Twilio 연결 대기 중이면 AudioRouter 설정은 twilio_media_stream에서 한다
    if not audio_router:
        # Twilio Media Stream이 먼저 연결될 때까지 대기하는 경우
        await send_to_app(
            WsMessage(
                type=WsMessageType.CALL_STATUS,
                data={"status": "waiting", "message": "전화 연결 중..."},
            )
        )

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            audio_router = _routers.get(call_id)
            if not audio_router:
                continue

            match msg_type:
                case "audio_chunk":
                    audio_b64 = msg.get("data", {}).get("audio", "")
                    if audio_b64:
                        await audio_router.handle_user_audio(audio_b64)
                case "vad_state":
                    state = msg.get("data", {}).get("state", "")
                    if state == "committed":
                        await audio_router.handle_user_audio_commit()
                case "text_input":
                    text = msg.get("data", {}).get("text", "")
                    if text:
                        await audio_router.handle_user_text(text)
                case "end_call":
                    logger.info("User ended call via WebSocket (call=%s)", call_id)
                    break

    except WebSocketDisconnect:
        logger.info("App WebSocket disconnected (call=%s)", call_id)
    except Exception as e:
        logger.error("App WebSocket error (call=%s): %s", call_id, e)
    finally:
        # 정리
        if call_id in _routers:
            await _routers[call_id].stop()
            del _routers[call_id]
        if call_id in _sessions:
            await _sessions[call_id].close()
            del _sessions[call_id]


@router.websocket("/calls/{call_id}/media-stream")
async def twilio_media_stream_ws(ws: WebSocket, call_id: str):
    """Twilio Media Stream WebSocket 연결.

    이 엔드포인트는 /twilio/webhook의 TwiML <Stream>이 연결하는 곳이다.
    수신자 오디오를 수신하여 Session B로 전달하고,
    Session A의 TTS 오디오를 Twilio로 전달한다.
    """
    # Note: Twilio webhook router에서 /twilio/media-stream/{call_id}로 연결하므로
    # 이 엔드포인트는 twilio_webhook.py에서 생성한 TwiML의 stream URL과 매칭된다.
    # 하지만 main.py에서 이 라우터는 /relay prefix가 붙으므로,
    # twilio_webhook.py에서 정확한 URL을 참조해야 한다.
    pass


# Twilio Media Stream은 별도로 twilio prefix 하에 등록한다.
# 이 라우터는 App WebSocket과 통합 관리를 위한 것이다.
