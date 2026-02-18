"""ConversationContextManager 테스트 — 슬라이딩 윈도우 대화 컨텍스트."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.realtime.context_manager import ConversationContextManager


class TestConversationContextManager:
    """Phase 3: 대화 컨텍스트 매니저 테스트."""

    def test_add_turn(self):
        """턴이 올바르게 추가됨."""
        ctx = ConversationContextManager()
        ctx.add_turn("user", "Hello, I'd like to make a reservation.")

        assert ctx.turn_count == 1

    def test_sliding_window(self):
        """max_turns 초과 시 오래된 턴이 제거됨."""
        ctx = ConversationContextManager(max_turns=3)
        for i in range(5):
            ctx.add_turn("user" if i % 2 == 0 else "recipient", f"Turn {i}")

        assert ctx.turn_count == 3
        context = ctx.format_context()
        assert "Turn 2" in context
        assert "Turn 3" in context
        assert "Turn 4" in context
        assert "Turn 0" not in context
        assert "Turn 1" not in context

    def test_max_chars_per_turn(self):
        """턴당 최대 문자 수 제한."""
        ctx = ConversationContextManager(max_chars=10)
        ctx.add_turn("user", "This is a very long sentence that exceeds the limit")

        context = ctx.format_context()
        # "User: " prefix + 10 chars max
        assert "This is a " in context
        assert "exceeds" not in context

    def test_format_context(self):
        """포맷이 올바름."""
        ctx = ConversationContextManager()
        ctx.add_turn("user", "예약하고 싶습니다")
        ctx.add_turn("recipient", "몇 분이세요?")

        context = ctx.format_context()
        assert "User: 예약하고 싶습니다" in context
        assert "Recipient: 몇 분이세요?" in context

    def test_empty_context(self):
        """빈 컨텍스트는 빈 문자열 반환."""
        ctx = ConversationContextManager()
        assert ctx.format_context() == ""
        assert ctx.turn_count == 0

    def test_empty_text_ignored(self):
        """빈 텍스트는 추가되지 않음."""
        ctx = ConversationContextManager()
        ctx.add_turn("user", "")
        ctx.add_turn("user", "   ")

        assert ctx.turn_count == 0

    def test_clear(self):
        """clear()로 모든 턴이 제거됨."""
        ctx = ConversationContextManager()
        ctx.add_turn("user", "Hello")
        ctx.add_turn("recipient", "Hi")
        assert ctx.turn_count == 2

        ctx.clear()
        assert ctx.turn_count == 0
        assert ctx.format_context() == ""

    @pytest.mark.asyncio
    async def test_inject_context_sends_event(self):
        """inject_context가 conversation.item.create를 전송함."""
        ctx = ConversationContextManager()
        ctx.add_turn("user", "Hello")
        ctx.add_turn("recipient", "안녕하세요")

        session = MagicMock()
        session.send_context_item = AsyncMock()

        await ctx.inject_context(session)

        session.send_context_item.assert_called_once()
        context_text = session.send_context_item.call_args[0][0]
        assert "User: Hello" in context_text
        assert "Recipient: 안녕하세요" in context_text

    @pytest.mark.asyncio
    async def test_inject_empty_context_noop(self):
        """빈 컨텍스트는 주입하지 않음."""
        ctx = ConversationContextManager()

        session = MagicMock()
        session.send_context_item = AsyncMock()

        await ctx.inject_context(session)

        session.send_context_item.assert_not_called()
