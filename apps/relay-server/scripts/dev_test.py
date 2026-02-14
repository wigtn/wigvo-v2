#!/usr/bin/env python3
"""WIGVO Relay Server Dev 테스트 스크립트.

서버 실행 → Health Check → API 테스트 → WebSocket 테스트 순서로 진행.

사용법:
    # 1. 서버를 먼저 실행 (별도 터미널):
    cd apps/relay-server
    uv run uvicorn src.main:app --reload --port 8000

    # 2. 테스트 실행:
    uv run python scripts/dev_test.py

    # 또는 특정 테스트만:
    uv run python scripts/dev_test.py --test health
    uv run python scripts/dev_test.py --test api
    uv run python scripts/dev_test.py --test ws
    uv run python scripts/dev_test.py --test guardrail
    uv run python scripts/dev_test.py --test all
"""

import argparse
import asyncio
import json
import os
import sys
import time

# src 모듈 import를 위한 경로 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"


# ─── ANSI Colors ───

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}")


def info(msg: str) -> None:
    print(f"  {CYAN}→{RESET} {msg}")


def header(title: str) -> None:
    print(f"\n{BOLD}{YELLOW}═══ {title} ═══{RESET}")


# ─── Test 1: Health Check ───


async def test_health() -> bool:
    header("1. Health Check")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/health")
            data = r.json()

            if r.status_code == 200 and data.get("status") == "ok":
                ok(f"GET /health → {r.status_code} {data}")
                return True
            else:
                fail(f"GET /health → {r.status_code} {data}")
                return False
    except httpx.ConnectError:
        fail("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요:")
        info("uv run uvicorn src.main:app --reload --port 8000")
        return False


# ─── Test 2: API Endpoints ───


async def test_api() -> bool:
    header("2. API Endpoints")
    all_pass = True

    async with httpx.AsyncClient() as client:
        # 2-1. OpenAPI docs
        r = await client.get(f"{BASE_URL}/docs")
        if r.status_code == 200:
            ok("GET /docs → Swagger UI 접근 가능")
        else:
            fail(f"GET /docs → {r.status_code}")
            all_pass = False

        # 2-2. OpenAPI schema
        r = await client.get(f"{BASE_URL}/openapi.json")
        if r.status_code == 200:
            schema = r.json()
            paths = list(schema.get("paths", {}).keys())
            ok(f"API 엔드포인트 {len(paths)}개 등록됨: {paths}")
        else:
            fail(f"GET /openapi.json → {r.status_code}")
            all_pass = False

        # 2-3. 존재하지 않는 통화 종료 → 404
        r = await client.post(
            f"{BASE_URL}/relay/calls/nonexistent/end",
            json={"call_id": "nonexistent", "reason": "test"},
        )
        if r.status_code == 404:
            ok("POST /relay/calls/nonexistent/end → 404 (정상: 없는 통화)")
        else:
            fail(f"POST /relay/calls/nonexistent/end → {r.status_code} (404 기대)")
            all_pass = False

        # 2-4. 중복 통화 시작 방지 (409)
        # 실제 Twilio/OpenAI 호출이 필요하므로 스킵
        info("중복 통화 테스트(409)는 실제 API 키 필요 — 스킵")

    return all_pass


# ─── Test 3: WebSocket 연결 ───


async def test_websocket() -> bool:
    header("3. WebSocket 연결")

    try:
        import websockets
    except ImportError:
        fail("websockets 패키지가 필요합니다 (이미 설치됨)")
        return False

    # 3-1. 존재하지 않는 call_id로 연결 → error 메시지 수신
    try:
        async with websockets.connect(
            f"{WS_URL}/relay/calls/test-fake-id/stream"
        ) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
            msg = json.loads(raw)

            if msg.get("type") == "error":
                ok(f"WS /relay/calls/fake/stream → error 메시지 수신: {msg['data']['message']}")
                return True
            else:
                info(f"WS 수신: {msg}")
                return True
    except Exception as e:
        fail(f"WebSocket 연결 실패: {e}")
        return False


# ─── Test 4: Guardrail 실시간 테스트 ───


async def test_guardrail() -> bool:
    header("4. Guardrail 실시간 테스트")
    from src.guardrail.checker import GuardrailChecker, GuardrailLevel

    gc = GuardrailChecker(target_language="ko")
    all_pass = True

    # 테스트 케이스
    cases = [
        ("안녕하세요, 예약 확인 부탁드립니다.", GuardrailLevel.LEVEL_1, "존댓말 → PASS"),
        ("이거 알겠어요", GuardrailLevel.LEVEL_2, "반말 어미 → 비동기 교정"),
        ("씨발이다", GuardrailLevel.LEVEL_3, "욕설 → 동기 차단"),
    ]

    for text, expected_level, description in cases:
        gc.reset()
        level = gc.check_text_delta(text)
        if level == expected_level:
            ok(f"'{text}' → Level {level} ({description})")
        else:
            fail(f"'{text}' → Level {level} (기대: Level {expected_level})")
            all_pass = False

    # blocking 상태 테스트
    gc.reset()
    gc.check_text_delta("씨발이다")
    if gc.is_blocking:
        ok("Level 3 → is_blocking = True (TTS 오디오 차단)")
    else:
        fail("Level 3인데 is_blocking = False")
        all_pass = False

    return all_pass


# ─── Test 5: Ring Buffer 벤치마크 ───


async def test_ring_buffer() -> bool:
    header("5. Ring Buffer 성능 테스트")
    from src.realtime.ring_buffer import AudioRingBuffer

    buf = AudioRingBuffer(capacity=1500)  # 30초
    chunk = b"\x00" * 160  # 20ms g711_ulaw

    # 30초 분량 쓰기 (1500 chunks)
    start = time.perf_counter()
    for _ in range(1500):
        buf.write(chunk)
    elapsed = (time.perf_counter() - start) * 1000

    ok(f"1500 chunks (30초) 쓰기: {elapsed:.2f}ms")

    # 절반 전송 마킹
    buf.mark_sent(750)
    unsent = buf.get_unsent()
    ok(f"미전송 {len(unsent)} chunks (gap={buf.gap_ms}ms)")

    # 미전송 바이트 추출
    start = time.perf_counter()
    audio_bytes = buf.get_unsent_audio_bytes()
    elapsed = (time.perf_counter() - start) * 1000
    ok(f"미전송 바이트 추출: {len(audio_bytes)} bytes in {elapsed:.2f}ms")

    return True


# ─── Test 6: Function Calling 시뮬레이션 ───


async def test_function_calling() -> bool:
    header("6. Function Calling 시뮬레이션")
    from src.tools.definitions import get_tools_for_mode
    from src.tools.executor import FunctionExecutor
    from src.types import ActiveCall, CallMode

    # Agent Mode 도구 확인
    tools = get_tools_for_mode("agent")
    ok(f"Agent Mode: {len(tools)}개 도구 — {[t['name'] for t in tools]}")

    # Function 실행 시뮬레이션
    call = ActiveCall(call_id="dev-test-001", mode=CallMode.AGENT)
    executor = FunctionExecutor(call=call)

    # 예약 확인
    result = await executor.execute(
        "confirm_reservation",
        json.dumps({
            "status": "confirmed",
            "date": "2026-03-01",
            "time": "14:00",
            "name": "김철수",
        }),
        "call_sim_1",
    )
    parsed = json.loads(result)
    ok(f"confirm_reservation → {parsed}")

    # 정보 수집
    result = await executor.execute(
        "collect_info",
        json.dumps({"info_type": "address", "value": "서울시 강남구 테헤란로 123"}),
        "call_sim_2",
    )
    ok(f"collect_info → collected_data={dict(call.collected_data)}")

    # 통화 결과 판정
    result = await executor.execute(
        "end_call_judgment",
        json.dumps({"result": "success", "reason": "예약 완료"}),
        "call_sim_3",
    )
    ok(f"end_call_judgment → call_result='{call.call_result}'")
    ok(f"function_call_logs: {len(call.function_call_logs)}건 기록됨")

    return True


# ─── Test 7: Cost Token 추적 시뮬레이션 ───


async def test_cost_tracking() -> bool:
    header("7. Cost Token 추적 시뮬레이션")
    from src.types import CostTokens

    # 5분 통화 시뮬레이션 (약 30 response.done 이벤트)
    total = CostTokens()
    for i in range(30):
        response_tokens = CostTokens(
            audio_input=80 + (i % 20),
            audio_output=30 + (i % 15),
            text_input=20 + (i % 10),
            text_output=10 + (i % 5),
        )
        total.add(response_tokens)

    ok(f"30 응답 누적 토큰:")
    info(f"  audio_input:  {total.audio_input:,}")
    info(f"  audio_output: {total.audio_output:,}")
    info(f"  text_input:   {total.text_input:,}")
    info(f"  text_output:  {total.text_output:,}")
    info(f"  total:        {total.total:,}")

    # 비용 추정 (PRD 7.4 기준)
    # Audio: $100/1M input, $200/1M output
    # Text: $5/1M input, $20/1M output
    audio_cost = (total.audio_input * 100 + total.audio_output * 200) / 1_000_000
    text_cost = (total.text_input * 5 + total.text_output * 20) / 1_000_000
    ok(f"예상 비용: ${audio_cost + text_cost:.4f} (audio=${audio_cost:.4f}, text=${text_cost:.4f})")

    return True


# ─── Main ───


async def main(test_name: str) -> None:
    print(f"\n{BOLD}🔧 WIGVO Relay Server Dev Test{RESET}")
    print(f"   Base URL: {BASE_URL}")
    print(f"   시간: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    tests = {
        "health": test_health,
        "api": test_api,
        "ws": test_websocket,
        "guardrail": test_guardrail,
        "ringbuffer": test_ring_buffer,
        "function": test_function_calling,
        "cost": test_cost_tracking,
    }

    if test_name == "all":
        run_tests = list(tests.values())
    elif test_name in tests:
        run_tests = [tests[test_name]]
    else:
        print(f"\n{RED}알 수 없는 테스트: {test_name}{RESET}")
        print(f"가능한 값: {', '.join(tests.keys())}, all")
        sys.exit(1)

    results = []
    for test_fn in run_tests:
        try:
            passed = await test_fn()
            results.append(passed)
        except Exception as e:
            fail(f"테스트 예외: {e}")
            results.append(False)

    # 결과 요약
    passed = sum(1 for r in results if r)
    total = len(results)
    header("결과 요약")
    if passed == total:
        print(f"  {GREEN}{BOLD}✓ {passed}/{total} 테스트 통과{RESET}")
    else:
        print(f"  {RED}{BOLD}✗ {passed}/{total} 테스트 통과{RESET}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WIGVO Dev Test")
    parser.add_argument(
        "--test",
        default="all",
        help="실행할 테스트 (health, api, ws, guardrail, ringbuffer, function, cost, all)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.test))
