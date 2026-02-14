"""Health Check 엔드포인트 (M-8)."""

import time

from fastapi import APIRouter

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def health_check():
    from src.main import active_calls

    return {
        "status": "ok",
        "active_sessions": len(active_calls),
        "uptime": round(time.time() - _start_time),
    }
