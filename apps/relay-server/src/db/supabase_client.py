"""Supabase DB Client — 통화 데이터 영속화.

Phase 5: 통화 종료 시 transcript_bilingual, cost_tokens,
guardrail_events, recovery_events 등을 Supabase에 저장한다.
"""

from __future__ import annotations

import datetime
import logging
import time
from typing import Any

from supabase import acreate_client, AsyncClient

from src.config import settings
from src.types import ActiveCall, CallStatus, CALL_RESULT_MAP

logger = logging.getLogger(__name__)

_client: AsyncClient | None = None


async def get_client() -> AsyncClient:
    """Supabase async client 싱글톤."""
    global _client
    if _client is None:
        _client = await acreate_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _client


async def persist_call(call: ActiveCall) -> None:
    """통화 종료 시 전체 데이터를 Supabase에 저장한다."""
    client = await get_client()

    # status 매핑: ENDED→COMPLETED, 그 외→FAILED
    db_status = "COMPLETED" if call.status == CallStatus.ENDED else "FAILED"

    # result 매핑: Agent mode → 판정 결과, Relay mode → 상태 기반 기본값
    if call.call_result:
        db_result = CALL_RESULT_MAP.get(call.call_result, "ERROR")
    else:
        db_result = "SUCCESS" if call.status == CallStatus.ENDED else "ERROR"

    # call.call_id는 Web app의 Supabase calls.id (PK) 값이다.
    # upsert(on_conflict="call_id")가 아닌 update().eq("id")로 기존 row를 직접 갱신.
    data: dict[str, Any] = {
        "call_sid": call.call_sid,
        "call_mode": call.mode.value,
        "source_language": call.source_language,
        "target_language": call.target_language,
        "target_name": call.collected_data.get("target_name") or None,
        "target_phone": call.collected_data.get("target_phone") or None,
        "status": db_status,
        "result": db_result,
        "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "communication_mode": call.communication_mode.value if call.communication_mode else None,
        "transcript_bilingual": [t.model_dump() if hasattr(t, "model_dump") else t for t in call.transcript_bilingual],
        "cost_tokens": call.cost_tokens.model_dump(),
        "guardrail_events": call.guardrail_events_log,
        "recovery_events": [e.model_dump() if hasattr(e, "model_dump") else e for e in call.recovery_events],
        "call_result": call.call_result,
        "call_result_data": call.call_result_data,
        "function_call_logs": call.function_call_logs,
        "duration_s": round(time.time() - call.started_at, 1) if call.started_at > 0 else None,
        "total_tokens": call.cost_tokens.total,
    }

    try:
        result = (
            await client.table("calls")
            .update(data)
            .eq("id", call.call_id)
            .execute()
        )
        logger.info("Call %s persisted to DB (status=%s)", call.call_id, db_status)

        # conversation 상태도 COMPLETED로 업데이트
        try:
            call_row = (
                await client.table("calls")
                .select("conversation_id")
                .eq("id", call.call_id)
                .single()
                .execute()
            )
            conv_id = call_row.data.get("conversation_id") if call_row.data else None
            if conv_id:
                await (
                    client.table("conversations")
                    .update({"status": "COMPLETED"})
                    .eq("id", conv_id)
                    .execute()
                )
                logger.info("Conversation %s status updated to COMPLETED", conv_id)
        except Exception:
            logger.warning("Failed to update conversation status for call %s", call.call_id, exc_info=True)

        return result
    except Exception:
        logger.exception("Failed to persist call %s", call.call_id)


async def update_call_field(call_id: str, field: str, value: Any) -> None:
    """특정 필드만 업데이트한다. call_id는 Supabase calls.id (PK)."""
    client = await get_client()
    try:
        await client.table("calls").update({field: value}).eq("id", call_id).execute()
    except Exception:
        logger.exception("Failed to update %s for call %s", field, call_id)
