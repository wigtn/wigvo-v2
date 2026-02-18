"""Agent Mode Function Calling 시뮬레이션. 서버 불필요 — 모듈 직접 import."""

import json

from src.tools.definitions import get_tools_for_mode
from src.tools.executor import FunctionExecutor
from src.types import ActiveCall, CallMode
from scripts.tests.helpers import ok, header


async def run() -> bool:
    header("Function Calling 시뮬레이션")

    # Agent Mode 도구 확인
    tools = get_tools_for_mode("agent")
    ok(f"Agent Mode: {len(tools)}개 도구 \u2014 {[t['name'] for t in tools]}")

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
    ok(f"confirm_reservation \u2192 {parsed}")

    # 정보 수집
    result = await executor.execute(
        "collect_info",
        json.dumps({"info_type": "address", "value": "서울시 강남구 테헤란로 123"}),
        "call_sim_2",
    )
    ok(f"collect_info \u2192 collected_data={dict(call.collected_data)}")

    # 통화 결과 판정
    result = await executor.execute(
        "end_call_judgment",
        json.dumps({"result": "success", "reason": "예약 완료"}),
        "call_sim_3",
    )
    ok(f"end_call_judgment \u2192 call_result='{call.call_result}'")
    ok(f"function_call_logs: {len(call.function_call_logs)}건 기록됨")

    return True
