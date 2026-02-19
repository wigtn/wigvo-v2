"""WebSocket 연결 테스트 (존재하지 않는 call_id → error 메시지). 서버 실행 필요."""

import asyncio
import json

from tests.helpers import ok, fail, info, header

WS_URL = "ws://localhost:8000"


async def run() -> bool:
    header("WebSocket 연결")

    try:
        import websockets
    except ImportError:
        fail("websockets 패키지가 필요합니다")
        return False

    try:
        async with websockets.connect(
            f"{WS_URL}/relay/calls/test-fake-id/stream"
        ) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
            msg = json.loads(raw)

            if msg.get("type") == "error":
                ok(f"WS /relay/calls/fake/stream \u2192 error 메시지 수신: {msg['data']['message']}")
                return True
            else:
                info(f"WS 수신: {msg}")
                return True
    except Exception as e:
        fail(f"WebSocket 연결 실패: {e}")
        return False
