#!/usr/bin/env python3
"""WIGVO Relay Server 테스트 러너.

사용법:
    # 전체 (E2E 제외)
    uv run python scripts/tests/run.py

    # 스위트별
    uv run python scripts/tests/run.py --suite integration    # 서버 필요
    uv run python scripts/tests/run.py --suite component      # 서버 불필요

    # 개별 테스트
    uv run python scripts/tests/run.py --test health
    uv run python scripts/tests/run.py --test guardrail

    # E2E 통화
    uv run python scripts/tests/run.py --test call --phone +821012345678 --scenario restaurant
    uv run python scripts/tests/run.py --test call --phone +821012345678 --scenario restaurant --auto
"""

import os
import sys

# relay-server 루트를 sys.path에 추가 (src.*, scripts.* import용)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import argparse
import asyncio
import time

from scripts.tests.helpers import BOLD, RESET, header, print_summary


# ─── 테스트 레지스트리 ───

INTEGRATION_TESTS = {
    "health": "scripts.tests.integration.test_health",
    "api": "scripts.tests.integration.test_api",
    "websocket": "scripts.tests.integration.test_websocket",
}

COMPONENT_TESTS = {
    "guardrail": "scripts.tests.component.test_guardrail",
    "ringbuffer": "scripts.tests.component.test_ring_buffer",
    "function": "scripts.tests.component.test_function_calling",
    "cost": "scripts.tests.component.test_cost_tracking",
}

ALL_TESTS = {**INTEGRATION_TESTS, **COMPONENT_TESTS}


async def run_test(module_path: str) -> bool:
    """동적 import 후 run() 호출."""
    from importlib import import_module
    mod = import_module(module_path)
    return await mod.run()


async def run_suite(tests: dict[str, str]) -> list[tuple[str, bool]]:
    """테스트 스위트 순차 실행."""
    results: list[tuple[str, bool]] = []
    for name, module_path in tests.items():
        try:
            passed = await run_test(module_path)
            results.append((name, passed))
        except Exception as e:
            from scripts.tests.helpers import fail
            fail(f"{name}: 예외 발생 — {e}")
            results.append((name, False))
    return results


async def run_call_test(args: argparse.Namespace) -> bool:
    """E2E 통화 테스트 실행."""
    from scripts.tests.e2e.call_client import run_client
    return await run_client(
        server_url=args.server,
        phone=args.phone,
        scenario_key=args.scenario,
        source_lang=args.source,
        target_lang=args.target,
        auto_mode=args.auto,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="WIGVO Relay Server 테스트 러너")
    parser.add_argument(
        "--suite",
        choices=["integration", "component", "all"],
        help="실행할 테스트 스위트",
    )
    parser.add_argument(
        "--test",
        choices=[*ALL_TESTS.keys(), "call"],
        help="개별 테스트 실행",
    )

    # E2E 전용 옵션
    parser.add_argument("--phone", help="E2E 수신자 전화번호 (E.164)")
    parser.add_argument(
        "--scenario",
        choices=["restaurant", "hospital", "delivery", "free"],
        default="restaurant",
        help="E2E 테스트 시나리오",
    )
    parser.add_argument("--server", default="http://localhost:8000", help="릴레이 서버 URL")
    parser.add_argument("--source", default="en", help="User 언어")
    parser.add_argument("--target", default="ko", help="수신자 언어")
    parser.add_argument("--auto", action="store_true", help="자동 모드 (LLM 동적 대화)")
    args = parser.parse_args()

    print(f"\n{BOLD}\U0001f527 WIGVO Relay Server Test Runner{RESET}")
    print(f"   시간: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    # E2E 통화 테스트
    if args.test == "call":
        if not args.phone:
            print("\n\u274c --phone 옵션이 필요합니다 (E.164 형식)")
            sys.exit(1)
        passed = await run_call_test(args)
        sys.exit(0 if passed else 1)

    # 개별 테스트
    if args.test and args.test in ALL_TESTS:
        header(f"개별 테스트: {args.test}")
        passed = await run_test(ALL_TESTS[args.test])
        print_summary([(args.test, passed)])
        sys.exit(0 if passed else 1)

    # 스위트 실행
    if args.suite == "integration":
        tests = INTEGRATION_TESTS
    elif args.suite == "component":
        tests = COMPONENT_TESTS
    elif args.suite == "all" or args.suite is None:
        # 기본: integration + component (E2E 제외)
        tests = ALL_TESTS
    else:
        tests = ALL_TESTS

    # --suite 없고 --test 없으면 전체 (E2E 제외) 실행
    results = await run_suite(tests)
    print_summary(results)

    all_pass = all(ok for _, ok in results)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
