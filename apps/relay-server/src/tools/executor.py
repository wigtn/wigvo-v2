"""Function Call 실행기.

OpenAI Realtime API에서 function_call 이벤트를 받으면,
해당 함수를 실행하고 결과를 ActiveCall에 기록한다.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Coroutine

from src.types import ActiveCall

logger = logging.getLogger(__name__)


class FunctionExecutor:
    """Function Call을 실행하고 결과를 기록한다."""

    def __init__(
        self,
        call: ActiveCall,
        on_call_result: Callable[[str, dict], Coroutine] | None = None,
    ):
        self.call = call
        self._on_call_result = on_call_result

    async def execute(self, function_name: str, arguments: str, call_id: str) -> str:
        """Function Call을 실행한다.

        Args:
            function_name: 호출할 함수 이름
            arguments: JSON 문자열 인자
            call_id: OpenAI function_call의 call_id (응답에 필요)

        Returns:
            함수 실행 결과 (JSON 문자열) -- OpenAI에 response로 전송
        """
        try:
            args = json.loads(arguments)
        except json.JSONDecodeError:
            args = {}

        logger.info(
            "[FunctionExecutor] Executing %s with args: %s",
            function_name,
            json.dumps(args, ensure_ascii=False)[:200],
        )

        # 함수별 실행
        handler = getattr(self, f"_handle_{function_name}", None)
        if handler:
            result = await handler(args)
        else:
            result = {"status": "error", "message": f"Unknown function: {function_name}"}

        # 로그 기록
        log_entry = {
            "function": function_name,
            "arguments": args,
            "result": result,
            "call_id": call_id,
            "timestamp": time.time(),
        }
        self.call.function_call_logs.append(log_entry)

        return json.dumps(result, ensure_ascii=False)

    async def _handle_confirm_reservation(self, args: dict[str, Any]) -> dict:
        """예약 확인 정보를 기록한다."""
        self.call.collected_data["reservation"] = args
        return {"status": "recorded", "message": f"예약 상태: {args.get('status', 'unknown')}"}

    async def _handle_search_location(self, args: dict[str, Any]) -> dict:
        """장소 정보를 기록한다."""
        self.call.collected_data["location"] = args
        return {"status": "recorded", "place": args.get("place_name", "")}

    async def _handle_collect_info(self, args: dict[str, Any]) -> dict:
        """수집된 정보를 기록한다."""
        info_type = args.get("info_type", "other")
        value = args.get("value", "")
        self.call.collected_data[info_type] = value
        return {"status": "recorded", "info_type": info_type}

    async def _handle_end_call_judgment(self, args: dict[str, Any]) -> dict:
        """통화 결과를 판정한다."""
        result = args.get("result", "unknown")
        reason = args.get("reason", "")

        self.call.call_result = result
        self.call.call_result_data = args

        logger.info(
            "[FunctionExecutor] Call result: %s -- %s",
            result,
            reason,
        )

        # 통화 결과 콜백
        if self._on_call_result:
            await self._on_call_result(result, args)

        return {"status": "judged", "result": result}
