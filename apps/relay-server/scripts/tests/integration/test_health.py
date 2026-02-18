"""GET /health 엔드포인트 테스트. 서버 실행 필요."""

import httpx

from scripts.tests.helpers import ok, fail, info, header

BASE_URL = "http://localhost:8000"


async def run() -> bool:
    header("Health Check")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/health")
            data = r.json()

            if r.status_code == 200 and data.get("status") == "ok":
                ok(f"GET /health \u2192 {r.status_code} {data}")
                return True
            else:
                fail(f"GET /health \u2192 {r.status_code} {data}")
                return False
    except httpx.ConnectError:
        fail("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요:")
        info("uv run uvicorn src.main:app --reload --port 8000")
        return False
