"""Health Check 엔드포인트 (M-8)."""

import time

from fastapi import APIRouter

from src.call_manager import call_manager

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "active_sessions": call_manager.active_call_count,
        "uptime": round(time.time() - _start_time),
    }
