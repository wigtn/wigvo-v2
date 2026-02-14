"""Function Calling executor tests."""

import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock

from src.tools.definitions import get_tools_for_mode, AGENT_MODE_TOOLS
from src.tools.executor import FunctionExecutor
from src.types import ActiveCall, CallMode


class TestToolDefinitions:
    def test_agent_mode_has_tools(self):
        """Agent Mode returns tools."""
        tools = get_tools_for_mode("agent")
        assert len(tools) == 4
        names = {t["name"] for t in tools}
        assert "confirm_reservation" in names
        assert "search_location" in names
        assert "collect_info" in names
        assert "end_call_judgment" in names

    def test_relay_mode_no_tools(self):
        """Relay Mode returns no tools."""
        tools = get_tools_for_mode("relay")
        assert len(tools) == 0

    def test_tool_schema_valid(self):
        """Each tool has a valid schema format."""
        for tool in AGENT_MODE_TOOLS:
            assert tool["type"] == "function"
            assert "name" in tool
            assert "description" in tool
            assert "parameters" in tool
            assert tool["parameters"]["type"] == "object"


@pytest.mark.asyncio
class TestFunctionExecutor:
    async def test_confirm_reservation(self):
        """Executes confirm_reservation function."""
        call = ActiveCall(call_id="test-001", mode=CallMode.AGENT)
        executor = FunctionExecutor(call=call)

        result = await executor.execute(
            "confirm_reservation",
            json.dumps({"status": "confirmed", "date": "2026-03-01", "time": "14:00"}),
            "call_test_1",
        )

        parsed = json.loads(result)
        assert parsed["status"] == "recorded"
        assert call.collected_data["reservation"]["status"] == "confirmed"
        assert len(call.function_call_logs) == 1

    async def test_collect_info(self):
        """Executes collect_info function."""
        call = ActiveCall(call_id="test-002", mode=CallMode.AGENT)
        executor = FunctionExecutor(call=call)

        await executor.execute(
            "collect_info",
            json.dumps({"info_type": "address", "value": "Seoul Gangnam-gu Teheran-ro 123"}),
            "call_test_2",
        )

        assert call.collected_data["address"] == "Seoul Gangnam-gu Teheran-ro 123"

    async def test_end_call_judgment(self):
        """Executes end_call_judgment function."""
        call = ActiveCall(call_id="test-003", mode=CallMode.AGENT)
        callback = AsyncMock()
        executor = FunctionExecutor(call=call, on_call_result=callback)

        await executor.execute(
            "end_call_judgment",
            json.dumps({"result": "success", "reason": "Reservation completed"}),
            "call_test_3",
        )

        assert call.call_result == "success"
        callback.assert_called_once_with("success", {"result": "success", "reason": "Reservation completed"})

    async def test_unknown_function(self):
        """Unknown function returns an error."""
        call = ActiveCall(call_id="test-004", mode=CallMode.AGENT)
        executor = FunctionExecutor(call=call)

        result = await executor.execute("nonexistent_func", "{}", "call_test_4")
        parsed = json.loads(result)
        assert parsed["status"] == "error"
