"""Supabase DB Client — 통화 데이터 영속화.

Phase 5: 통화 종료 시 transcript_bilingual, cost_tokens,
guardrail_events, recovery_events 등을 Supabase에 저장한다.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from supabase import acreate_client, AsyncClient

from src.config import settings
from src.types import ActiveCall

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

    data: dict[str, Any] = {
        "call_id": call.call_id,
        "call_sid": call.call_sid,
        "call_mode": call.mode.value if hasattr(call.mode, 'value') else str(call.mode),
        "source_language": call.source_language,
        "target_language": call.target_language,
        "status": call.status.value if hasattr(call.status, 'value') else str(call.status),
        "transcript_bilingual": [t.model_dump() if hasattr(t, 'model_dump') else t for t in call.transcript_bilingual],
        "cost_tokens": call.cost_tokens.model_dump() if hasattr(call.cost_tokens, 'model_dump') else call.cost_tokens,
        "guardrail_events": [e.model_dump() if hasattr(e, 'model_dump') else e for e in call.guardrail_events_log],
        "recovery_events": [e.model_dump() if hasattr(e, 'model_dump') else e for e in call.recovery_events],
        "call_result": call.call_result,
        "call_result_data": call.call_result_data,
        "auto_ended": call.auto_ended,
        "function_call_logs": call.function_call_logs,
        "duration_s": round(time.time() - call.started_at, 1) if call.started_at > 0 else None,
        "total_tokens": call.cost_tokens.total,
    }

    try:
        result = await client.table("calls").upsert(data, on_conflict="call_id").execute()
        logger.info("Call %s persisted to DB", call.call_id)
        return result
    except Exception:
        logger.exception("Failed to persist call %s", call.call_id)


async def update_call_field(call_id: str, field: str, value: Any) -> None:
    """특정 필드만 업데이트한다."""
    client = await get_client()
    try:
        await client.table("calls").update({field: value}).eq("call_id", call_id).execute()
    except Exception:
        logger.exception("Failed to update %s for call %s", field, call_id)
