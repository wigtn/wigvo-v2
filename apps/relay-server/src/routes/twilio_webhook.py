"""Twilio webhook — TwiML 응답 + Media Stream 연결 + status callback."""

import asyncio
import logging

from fastapi import APIRouter, Form, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from src.config import settings
from src.prompt.generator_v3 import generate_session_a_prompt, generate_session_b_prompt
from src.realtime.audio_router import AudioRouter
from src.realtime.session_manager import DualSessionManager
from src.twilio.media_stream import TwilioMediaStreamHandler
from src.types import WsMessage, WsMessageType

router = APIRouter(tags=["twilio"])
logger = logging.getLogger(__name__)


@router.post("/webhook/{call_id}")
async def twilio_webhook(call_id: str):
    """Twilio가 전화를 연결하면 호출하는 webhook.

    TwiML로 Media Stream을 연결하여 양방향 오디오 스트리밍을 시작한다.
    """
    ws_url = settings.relay_server_url.replace("http", "ws")
    stream_url = f"{ws_url}/twilio/media-stream/{call_id}"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="call_id" value="{call_id}" />
        </Stream>
    </Connect>
</Response>"""

    logger.info("TwiML webhook for call_id=%s, stream_url=%s", call_id, stream_url)
    return Response(content=twiml, media_type="application/xml")


@router.post("/status-callback/{call_id}")
async def twilio_status_callback(
    call_id: str,
    request: Request,
    CallStatus: str = Form(""),
    CallSid: str = Form(""),
    CallDuration: str = Form(""),
):
    """Twilio 통화 상태 변경 콜백."""
    logger.info(
        "Twilio status callback: call_id=%s, status=%s, sid=%s, duration=%s",
        call_id,
        CallStatus,
        CallSid,
        CallDuration,
    )

    # Active call 상태 업데이트는 main.py의 active_calls를 통해 처리
    from src.main import active_calls
    from src.types import CallStatus as CallStatusEnum

    if call_id in active_calls:
        call = active_calls[call_id]
        status_map = {
            "completed": CallStatusEnum.ENDED,
            "busy": CallStatusEnum.FAILED,
            "no-answer": CallStatusEnum.FAILED,
            "failed": CallStatusEnum.FAILED,
            "canceled": CallStatusEnum.FAILED,
        }
        if CallStatus in status_map:
            call.status = status_map[CallStatus]
            logger.info("Call %s status updated to %s", call_id, call.status)

    return {"status": "ok"}


@router.websocket("/media-stream/{call_id}")
async def twilio_media_stream(ws: WebSocket, call_id: str):
    """Twilio Media Stream WebSocket.

    TwiML <Stream>이 연결하는 엔드포인트.
    수신자 오디오 → Session B, Session A TTS → Twilio.
    """
    from src.main import active_calls
    from src.routes.stream import _routers, _sessions

    await ws.accept()
    logger.info("Twilio Media Stream connected (call=%s)", call_id)

    call = active_calls.get(call_id)
    if not call:
        logger.error("Twilio Media Stream: call %s not found", call_id)
        await ws.close()
        return

    # Twilio handler 생성
    twilio_handler = TwilioMediaStreamHandler(ws=ws, call=call)

    # DualSession 생성 (아직 없으면)
    if call_id not in _sessions:
        dual_session = DualSessionManager(
            mode=call.mode,
            source_language=call.source_language,
            target_language=call.target_language,
        )
        prompt_a = generate_session_a_prompt(
            mode=call.mode,
            source_language=call.source_language,
            target_language=call.target_language,
            collected_data=call.collected_data,
        )
        prompt_b = generate_session_b_prompt(
            source_language=call.source_language,
            target_language=call.target_language,
        )
        await dual_session.connect(prompt_a, prompt_b)
        _sessions[call_id] = dual_session
    else:
        dual_session = _sessions[call_id]

    # App WebSocket에 메시지를 보내는 함수 (stream.py의 app_websocket이 처리)
    app_ws_queue: asyncio.Queue[WsMessage] = asyncio.Queue()

    async def send_to_app(msg: WsMessage) -> None:
        await app_ws_queue.put(msg)

    # AudioRouter 생성
    audio_router = AudioRouter(
        call=call,
        dual_session=dual_session,
        twilio_handler=twilio_handler,
        app_ws_send=send_to_app,
    )
    _routers[call_id] = audio_router
    await audio_router.start()

    # OpenAI 세션 리스닝 시작 (백그라운드)
    listen_task = asyncio.create_task(dual_session.listen_all())

    try:
        while True:
            raw = await ws.receive_text()
            parsed = await twilio_handler.handle_message(raw)

            if parsed and parsed.event == "media":
                audio = twilio_handler.extract_audio(parsed)
                if audio:
                    await audio_router.handle_twilio_audio(audio)

            if twilio_handler.is_closed:
                break

    except WebSocketDisconnect:
        logger.info("Twilio Media Stream disconnected (call=%s)", call_id)
    except Exception as e:
        logger.error("Twilio Media Stream error (call=%s): %s", call_id, e)
    finally:
        listen_task.cancel()
        await audio_router.stop()
