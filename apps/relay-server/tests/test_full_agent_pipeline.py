"""FullAgentPipeline 단위 테스트.

핵심 검증 사항:
  - TextToVoicePipeline 기반 동작 (text 입력, EchoDetector 포함)
  - Agent 피드백 루프: 수신자 번역 → Session A 전달
  - FULL_AGENT 모드에서 올바른 Pipeline 생성
"""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.audio_router import AudioRouter
from src.types import ActiveCall, CallMode, CommunicationMode


def _make_call(**overrides) -> ActiveCall:
    defaults = dict(
        call_id="test-call-agent",
        user_id="u1",
        mode=CallMode.AGENT,
        source_language="en",
        target_language="ko",
        target_phone="+821012345678",
        twilio_call_sid="CA_test",
        communication_mode=CommunicationMode.FULL_AGENT,
    )
    defaults.update(overrides)
    return ActiveCall(**defaults)


def _make_router(**call_overrides) -> AudioRouter:
    """FullAgent 모드의 AudioRouter(→FullAgentPipeline) 인스턴스 생성."""
    call = _make_call(**call_overrides)

    dual = MagicMock()
    dual.session_a = MagicMock()
    dual.session_a.on = MagicMock()
    dual.session_a.set_on_connection_lost = MagicMock()
    dual.session_a._send = AsyncMock()
    dual.session_a.send_text_item = AsyncMock()
    dual.session_a.create_response = AsyncMock()
    dual.session_b = MagicMock()
    dual.session_b.on = MagicMock()
    dual.session_b.set_on_connection_lost = MagicMock()
    dual.session_b._send = AsyncMock()
    dual.session_b.clear_input_buffer = AsyncMock()

    twilio_handler = MagicMock()
    twilio_handler.send_audio = AsyncMock()
    twilio_handler.send_clear = AsyncMock()

    app_ws_send = AsyncMock()

    with patch("src.realtime.pipeline.text_to_voice.settings") as mock_settings:
        mock_settings.guardrail_enabled = False
        mock_settings.ring_buffer_capacity_slots = 100
        mock_settings.call_warning_ms = 480_000
        mock_settings.max_call_duration_ms = 600_000
        mock_settings.audio_energy_gate_enabled = False
        mock_settings.audio_energy_min_rms = 150.0
        mock_settings.echo_detector_enabled = True
        mock_settings.echo_detector_threshold = 0.6
        mock_settings.echo_detector_safety_cooldown_s = 0.3
        mock_settings.echo_detector_min_delay_chunks = 4
        mock_settings.echo_detector_max_delay_chunks = 30
        mock_settings.echo_detector_correlation_window = 10
        mock_settings.echo_gate_cooldown_s = 2.5
        router = AudioRouter(
            call=call,
            dual_session=dual,
            twilio_handler=twilio_handler,
            app_ws_send=app_ws_send,
        )

    return router


class TestFullAgentPipelineCreation:
    """FullAgentPipeline이 올바르게 생성되는지 검증."""

    def test_pipeline_type(self):
        """FULL_AGENT 모드에서 FullAgentPipeline이 생성된다."""
        from src.realtime.pipeline.full_agent import FullAgentPipeline

        router = _make_router()
        assert isinstance(router._pipeline, FullAgentPipeline)

    def test_inherits_text_to_voice(self):
        """FullAgentPipeline은 TextToVoicePipeline을 상속한다."""
        from src.realtime.pipeline.text_to_voice import TextToVoicePipeline

        router = _make_router()
        assert isinstance(router._pipeline, TextToVoicePipeline)

    def test_has_echo_detector(self):
        """FullAgent도 EchoDetector를 초기화한다 (Session A TTS echo 방지)."""
        router = _make_router()
        assert hasattr(router._pipeline, "_echo_detector")
        assert router._pipeline._echo_detector is not None


class TestFullAgentFeedbackLoop:
    """Agent 피드백 루프 검증."""

    @pytest.mark.asyncio
    async def test_recipient_translation_forwarded_to_session_a(self):
        """수신자 번역이 Session A에 전달된다."""
        router = _make_router()
        router.session_a = MagicMock()
        router.session_a.is_generating = False
        router.session_a.send_user_text = AsyncMock()

        await router._on_turn_complete("recipient", "네, 예약 가능합니다")

        router.session_a.send_user_text.assert_called_once()
        sent = router.session_a.send_user_text.call_args[0][0]
        assert "[Recipient says]:" in sent
        assert "네, 예약 가능합니다" in sent

    @pytest.mark.asyncio
    async def test_user_turn_not_forwarded(self):
        """User 턴은 Session A에 전달하지 않는다."""
        router = _make_router()
        router.session_a = MagicMock()
        router.session_a.is_generating = False
        router.session_a.send_user_text = AsyncMock()

        await router._on_turn_complete("user", "Hello")

        router.session_a.send_user_text.assert_not_called()

    @pytest.mark.asyncio
    async def test_forwarding_waits_for_session_a(self):
        """Session A가 생성 중이면 완료까지 대기한다."""
        router = _make_router()
        router.session_a = MagicMock()
        router.session_a.is_generating = True
        router.session_a.wait_for_done = AsyncMock()
        router.session_a.send_user_text = AsyncMock()

        await router._on_turn_complete("recipient", "test reply")

        router.session_a.wait_for_done.assert_called_once_with(timeout=5.0)

    @pytest.mark.asyncio
    async def test_transcript_history_updated(self):
        """수신자 번역이 transcript_history에 추가된다."""
        router = _make_router()
        router.session_a = MagicMock()
        router.session_a.is_generating = False
        router.session_a.send_user_text = AsyncMock()

        await router._on_turn_complete("recipient", "네, 도와드릴게요")

        assert any(
            h["role"] == "recipient" and "네, 도와드릴게요" in h["text"]
            for h in router.call.transcript_history
        )


class TestFullAgentTextHandling:
    """FullAgent 텍스트 입력 검증 (Agent mode = no per-response override)."""

    @pytest.mark.asyncio
    async def test_agent_mode_uses_send_user_text(self):
        """Agent 모드에서는 per-response override 없이 send_user_text 사용."""
        router = _make_router()
        router.session_a = MagicMock()
        router.session_a.is_generating = False
        router.session_a.send_user_text = AsyncMock()
        router.interrupt = MagicMock()
        router.interrupt.is_recipient_speaking = False
        router.context_manager = MagicMock()
        router.context_manager.inject_context = AsyncMock()

        await router.handle_user_text("2명이요")

        router.session_a.send_user_text.assert_called_once_with("2명이요")
        router.dual_session.session_a.send_text_item.assert_not_called()

    @pytest.mark.asyncio
    async def test_audio_input_ignored(self):
        """FullAgent도 audio 입력을 무시한다."""
        router = _make_router()
        await router.handle_user_audio(base64.b64encode(b"\x00" * 100).decode())
