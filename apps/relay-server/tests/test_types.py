"""Types / Pydantic model tests."""

import pytest
from src.types import (
    ActiveCall,
    CallMode,
    CostTokens,
    TranscriptEntry,
    RecoveryEvent,
    RecoveryEventType,
    SessionState,
    WsMessage,
    WsMessageType,
)


class TestCostTokens:
    def test_add_accumulates(self):
        """CostTokens.add() accumulates values."""
        total = CostTokens()
        t1 = CostTokens(audio_input=100, audio_output=50, text_input=20, text_output=10)
        t2 = CostTokens(audio_input=200, audio_output=100, text_input=30, text_output=20)

        total.add(t1)
        total.add(t2)

        assert total.audio_input == 300
        assert total.audio_output == 150
        assert total.text_input == 50
        assert total.text_output == 30
        assert total.total == 530

    def test_total_property(self):
        """total is the sum of all tokens."""
        t = CostTokens(audio_input=10, audio_output=20, text_input=5, text_output=3)
        assert t.total == 38


class TestTranscriptEntry:
    def test_create_entry(self):
        """Creates a TranscriptEntry."""
        entry = TranscriptEntry(
            role="user",
            original_text="Hello, I'd like to make a reservation",
            translated_text="Annyeonghaseyo, yeyakhago sipseumnida",
            language="en",
            timestamp=1000.0,
        )
        assert entry.role == "user"
        assert entry.language == "en"


class TestActiveCall:
    def test_default_values(self):
        """ActiveCall has correct default values."""
        call = ActiveCall(call_id="test-001")
        assert call.mode == CallMode.RELAY
        assert call.source_language == "en"
        assert call.target_language == "ko"
        assert call.cost_tokens.total == 0
        assert len(call.transcript_bilingual) == 0
        assert len(call.recovery_events) == 0
        assert call.call_result == ""
        assert call.auto_ended is False

    def test_agent_mode_call(self):
        """Creates an Agent Mode ActiveCall."""
        call = ActiveCall(
            call_id="test-002",
            mode=CallMode.AGENT,
            collected_data={"task": "reservation"},
        )
        assert call.mode == CallMode.AGENT
        assert call.collected_data["task"] == "reservation"

    def test_transcript_bilingual_append(self):
        """Appends entries to transcript_bilingual."""
        call = ActiveCall(call_id="test-003")
        call.transcript_bilingual.append(
            TranscriptEntry(role="user", original_text="Hello", language="en")
        )
        call.transcript_bilingual.append(
            TranscriptEntry(role="recipient", original_text="Annyeonghaseyo", language="ko")
        )
        assert len(call.transcript_bilingual) == 2


class TestWsMessage:
    def test_caption_original(self):
        """Creates a CAPTION_ORIGINAL message."""
        msg = WsMessage(
            type=WsMessageType.CAPTION_ORIGINAL,
            data={"role": "recipient", "text": "Annyeonghaseyo", "stage": 1},
        )
        assert msg.type == WsMessageType.CAPTION_ORIGINAL

    def test_caption_translated(self):
        """Creates a CAPTION_TRANSLATED message."""
        msg = WsMessage(
            type=WsMessageType.CAPTION_TRANSLATED,
            data={"role": "recipient", "text": "Hello", "stage": 2},
        )
        assert msg.type == WsMessageType.CAPTION_TRANSLATED
