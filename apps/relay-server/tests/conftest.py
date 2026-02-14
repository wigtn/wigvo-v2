"""Test fixtures for WIGVO Relay Server."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.types import (
    ActiveCall,
    CallMode,
    CallStatus,
    CostTokens,
    SessionConfig,
    TranscriptEntry,
    VadMode,
)


@pytest.fixture
def relay_call() -> ActiveCall:
    """Relay Mode ActiveCall fixture."""
    return ActiveCall(
        call_id="test-relay-001",
        call_sid="CA_test_sid",
        mode=CallMode.RELAY,
        source_language="en",
        target_language="ko",
        status=CallStatus.CONNECTED,
    )


@pytest.fixture
def agent_call() -> ActiveCall:
    """Agent Mode ActiveCall fixture."""
    return ActiveCall(
        call_id="test-agent-001",
        call_sid="CA_test_sid",
        mode=CallMode.AGENT,
        source_language="ko",
        target_language="ko",
        status=CallStatus.CONNECTED,
        collected_data={
            "task": "pizza_order",
            "details": "pepperoni pizza 1 pan, address: Seoul Gangnam-gu",
        },
    )


@pytest.fixture
def mock_session() -> MagicMock:
    """Mock RealtimeSession."""
    session = MagicMock()
    session.label = "SessionA"
    session.ws = AsyncMock()
    session.session_id = "sess_test_123"
    session.is_closed = False
    session.config = SessionConfig()
    session.on = MagicMock()
    session.send_audio = AsyncMock()
    session.send_text = AsyncMock()
    session.commit_audio = AsyncMock()
    session.cancel_response = AsyncMock()
    session.send_function_call_output = AsyncMock()
    session.connect = AsyncMock()
    session.close = AsyncMock()
    return session
