"""API 엔드포인트 테스트 (/docs, /openapi.json, 404 에러코드). 서버 실행 필요."""

import httpx

from tests.helpers import ok, fail, info, header

BASE_URL = "http://localhost:8000"


async def run() -> bool:
    header("API Endpoints")
    all_pass = True

    async with httpx.AsyncClient() as client:
        # OpenAPI docs
        r = await client.get(f"{BASE_URL}/docs")
        if r.status_code == 200:
            ok("GET /docs \u2192 Swagger UI 접근 가능")
        else:
            fail(f"GET /docs \u2192 {r.status_code}")
            all_pass = False

        # OpenAPI schema
        r = await client.get(f"{BASE_URL}/openapi.json")
        if r.status_code == 200:
            schema = r.json()
            paths = list(schema.get("paths", {}).keys())
            ok(f"API 엔드포인트 {len(paths)}개 등록됨: {paths}")
        else:
            fail(f"GET /openapi.json \u2192 {r.status_code}")
            all_pass = False

        # 존재하지 않는 통화 종료 → 404
        r = await client.post(
            f"{BASE_URL}/relay/calls/nonexistent/end",
            json={"call_id": "nonexistent", "reason": "test"},
        )
        if r.status_code == 404:
            ok("POST /relay/calls/nonexistent/end \u2192 404 (정상: 없는 통화)")
        else:
            fail(f"POST /relay/calls/nonexistent/end \u2192 {r.status_code} (404 기대)")
            all_pass = False

        # 중복 통화 테스트(409)는 실제 API 키 필요
        info("중복 통화 테스트(409)는 실제 API 키 필요 \u2014 스킵")

    return all_pass
