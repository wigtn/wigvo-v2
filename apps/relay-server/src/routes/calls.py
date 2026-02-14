"""통화 시작/종료 API 엔드포인트.

PRD 8.2:
  POST /relay/calls/start — 전화 발신 + Realtime Session 시작
  POST /relay/calls/{call_id}/end — 통화 종료

통화 시작 시퀀스 (PRD 3.1):
  1. App → Relay Server: POST /relay/calls/start
  2. Relay Server: Twilio 발신 + OpenAI Dual Session 생성
  3. Relay Server → Supabase: call 상태를 CALLING으로 업데이트
  4. Relay Server → App: { relayWsUrl, callSid, sessionIds }
  5. App → Relay Server: WebSocket 연결
"""

import logging

from fastapi import APIRouter, HTTPException

from src.config import settings
from src.prompt.generator_v3 import generate_session_a_prompt, generate_session_b_prompt
from src.realtime.session_manager import DualSessionManager
from src.twilio.outbound import make_call
from src.types import (
    ActiveCall,
    CallEndRequest,
    CallStartRequest,
    CallStartResponse,
    CallStatus,
)

router = APIRouter(tags=["calls"])
logger = logging.getLogger(__name__)


@router.post("/calls/start", response_model=CallStartResponse)
async def start_call(req: CallStartRequest):
    """전화 발신을 시작하고 OpenAI Dual Session을 생성한다."""
    from src.main import active_calls

    if req.call_id in active_calls:
        raise HTTPException(status_code=409, detail="Call already in progress")

    # Feature flag 확인
    if settings.call_mode != "realtime":
        raise HTTPException(
            status_code=400,
            detail=f"Call mode '{settings.call_mode}' not supported by this endpoint",
        )

    logger.info(
        "Starting call: id=%s, mode=%s, %s→%s",
        req.call_id,
        req.mode.value,
        req.source_language,
        req.target_language,
    )

    # 1. ActiveCall 생성
    call = ActiveCall(
        call_id=req.call_id,
        mode=req.mode,
        source_language=req.source_language,
        target_language=req.target_language,
        status=CallStatus.CALLING,
        collected_data=req.collected_data or {},
    )

    # 2. System Prompt 생성
    prompt_a = generate_session_a_prompt(
        mode=req.mode,
        source_language=req.source_language,
        target_language=req.target_language,
        collected_data=req.collected_data,
    )
    prompt_b = generate_session_b_prompt(
        source_language=req.source_language,
        target_language=req.target_language,
    )

    # 3. OpenAI Dual Session 생성
    dual_session = DualSessionManager(
        mode=req.mode,
        source_language=req.source_language,
        target_language=req.target_language,
    )

    try:
        await dual_session.connect(prompt_a, prompt_b)
    except Exception as e:
        logger.error("Failed to create OpenAI sessions: %s", e)
        raise HTTPException(status_code=502, detail="Failed to create AI sessions")

    call.session_a_id = dual_session.session_a.session_id
    call.session_b_id = dual_session.session_b.session_id

    # 4. Twilio 발신
    try:
        call_sid = make_call(
            phone_number=req.phone_number,
            call_id=req.call_id,
        )
        call.call_sid = call_sid
    except Exception as e:
        logger.error("Failed to make Twilio call: %s", e)
        await dual_session.close()
        raise HTTPException(status_code=502, detail="Failed to initiate phone call")

    # 5. Active call 등록
    active_calls[req.call_id] = call

    # WebSocket URL 생성
    ws_base = settings.relay_server_url.replace("http", "ws")
    relay_ws_url = f"{ws_base}/relay/calls/{req.call_id}/stream"

    logger.info(
        "Call started: id=%s, sid=%s, ws=%s",
        req.call_id,
        call_sid,
        relay_ws_url,
    )

    return CallStartResponse(
        call_id=req.call_id,
        call_sid=call_sid,
        relay_ws_url=relay_ws_url,
        session_ids={
            "session_a": call.session_a_id,
            "session_b": call.session_b_id,
        },
    )


@router.post("/calls/{call_id}/end")
async def end_call(call_id: str, req: CallEndRequest | None = None):
    """통화를 종료한다."""
    from src.main import active_calls

    call = active_calls.get(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = CallStatus.ENDED
    reason = req.reason if req else "user_hangup"
    logger.info("Ending call: id=%s, reason=%s", call_id, reason)

    # Twilio 통화 종료
    try:
        from src.twilio.outbound import get_twilio_client

        client = get_twilio_client()
        client.calls(call.call_sid).update(status="completed")
    except Exception as e:
        logger.warning("Failed to terminate Twilio call: %s", e)

    # Active call 제거
    active_calls.pop(call_id, None)

    return {"status": "ended", "call_id": call_id, "reason": reason}
