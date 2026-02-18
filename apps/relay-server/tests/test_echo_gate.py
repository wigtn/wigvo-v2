"""Echo Gate v2 테스트 — 에코 피드백 루프 차단 + deaf window 제거 검증.

Echo Gate v2 핵심 원칙:
  - Session B INPUT은 항상 활성 (수신자 발화 감지를 위해)
  - Session B OUTPUT만 억제 (큐에 저장 후 해제 시 배출)
  - 수신자 발화 감지 시 즉시 게이트 해제
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.audio_router import AudioRouter
from src.realtime.session_b import SessionBHandler
from src.types import ActiveCall, CallMode


def _make_call(**overrides) -> ActiveCall:
    defaults = dict(
        call_id="test-call",
        user_id="u1",
        mode=CallMode.RELAY,
        source_language="en",
        target_language="ko",
        target_phone="+821012345678",
        twilio_call_sid="CA_test",
    )
    defaults.update(overrides)
    return ActiveCall(**defaults)


def _make_router() -> AudioRouter:
    """최소한의 mock 으로 AudioRouter 인스턴스를 생성한다."""
    call = _make_call()

    # DualSessionManager mock
    dual = MagicMock()
    dual.session_a = MagicMock()
    dual.session_a.on = MagicMock()
    dual.session_a.set_on_connection_lost = MagicMock()
    dual.session_a._send = AsyncMock()
    dual.session_b = MagicMock()
    dual.session_b.on = MagicMock()
    dual.session_b.set_on_connection_lost = MagicMock()
    dual.session_b._send = AsyncMock()

    twilio_handler = MagicMock()
    twilio_handler.send_audio = AsyncMock()
    twilio_handler.send_clear = AsyncMock()

    app_ws_send = AsyncMock()

    with patch("src.realtime.audio_router.settings") as mock_settings:
        mock_settings.guardrail_enabled = False
        mock_settings.ring_buffer_capacity_slots = 100
        mock_settings.echo_gate_cooldown_s = 0.3
        mock_settings.call_warning_ms = 480_000
        mock_settings.max_call_duration_ms = 600_000
        router = AudioRouter(
            call=call,
            dual_session=dual,
            twilio_handler=twilio_handler,
            app_ws_send=app_ws_send,
        )

    return router


class TestEchoGateV2:
    """Echo Gate v2: OUTPUT 억제 + INPUT 활성 테스트."""

    def test_echo_suppression_activates_on_tts(self):
        """TTS 콜백 시 output_suppressed = True, _echo_suppressed = True."""
        router = _make_router()
        assert router._echo_suppressed is False
        assert router.session_b.output_suppressed is False

        router._activate_echo_suppression()

        assert router._echo_suppressed is True
        assert router.session_b.output_suppressed is True

    @pytest.mark.asyncio
    async def test_echo_suppression_deactivates_after_cooldown(self):
        """쿨다운 후 output_suppressed = False."""
        router = _make_router()
        router.session_b.flush_pending_output = AsyncMock()

        router._activate_echo_suppression()
        assert router._echo_suppressed is True

        with patch("src.realtime.audio_router.settings") as mock_settings:
            mock_settings.echo_gate_cooldown_s = 0.05  # 빠른 테스트
            router._start_echo_cooldown()
            await asyncio.sleep(0.1)

        assert router._echo_suppressed is False
        assert router.session_b.output_suppressed is False
        router.session_b.flush_pending_output.assert_called_once()

    @pytest.mark.asyncio
    async def test_twilio_audio_not_blocked_during_echo(self):
        """Echo Gate v2: 억제 중에도 Twilio 오디오가 Session B에 전달됨 (INPUT 항상 활성)."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()
        router._echo_suppressed = True
        router.session_b.output_suppressed = True

        await router.handle_twilio_audio(b"\x00\x01\x02")

        # INPUT은 차단되지 않음 — 항상 Session B에 전달
        router.session_b.send_recipient_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_recipient_speech_releases_echo_gate(self):
        """억제 중 수신자 발화 감지 시 즉시 게이트 해제."""
        router = _make_router()
        router._echo_suppressed = True
        router.session_b.output_suppressed = True
        router.session_b.flush_pending_output = AsyncMock()

        # first_message mock
        router.first_message = MagicMock()
        router.first_message.on_recipient_speech_detected = AsyncMock()
        router.call.first_message_sent = False

        # 가짜 쿨다운 task
        cooldown_task = MagicMock()
        cooldown_task.done.return_value = False
        cooldown_task.cancel = MagicMock()
        router._echo_cooldown_task = cooldown_task

        await router._on_recipient_started()

        # 게이트 즉시 해제됨
        assert router._echo_suppressed is False
        assert router.session_b.output_suppressed is False
        cooldown_task.cancel.assert_called_once()
        router.session_b.flush_pending_output.assert_called_once()
        router.first_message.on_recipient_speech_detected.assert_called_once()

    @pytest.mark.asyncio
    async def test_pending_output_flushed_after_cooldown(self):
        """쿨다운 완료 시 큐에 저장된 출력이 배출된다."""
        router = _make_router()
        router.session_b.flush_pending_output = AsyncMock()

        router._activate_echo_suppression()

        with patch("src.realtime.audio_router.settings") as mock_settings:
            mock_settings.echo_gate_cooldown_s = 0.05
            router._start_echo_cooldown()
            await asyncio.sleep(0.1)

        router.session_b.flush_pending_output.assert_called_once()

    @pytest.mark.asyncio
    async def test_speech_detection_not_blocked_during_suppression(self):
        """억제 중에도 수신자 발화 시작 이벤트는 항상 통과."""
        router = _make_router()
        router._echo_suppressed = True
        router.session_b.output_suppressed = True
        router.session_b.flush_pending_output = AsyncMock()

        # interrupt mock (first_message_sent = True)
        router.interrupt = MagicMock()
        router.interrupt.on_recipient_speech_started = AsyncMock()
        router.call.first_message_sent = True

        await router._on_recipient_started()

        # 게이트 해제 + interrupt 처리
        assert router._echo_suppressed is False
        router.interrupt.on_recipient_speech_started.assert_called_once()

    def test_echo_cooldown_reset_on_new_tts(self):
        """새 TTS 시작 시 기존 쿨다운 타이머가 취소된다."""
        router = _make_router()

        old_task = MagicMock()
        old_task.done.return_value = False
        old_task.cancel = MagicMock()
        router._echo_cooldown_task = old_task

        router._activate_echo_suppression()

        old_task.cancel.assert_called_once()
        assert router._echo_cooldown_task is None

    @pytest.mark.asyncio
    async def test_guardrail_retts_triggers_echo_gate(self):
        """Guardrail 재TTS 경로도 echo gate를 경유한다."""
        router = _make_router()
        router.twilio_handler.send_audio = AsyncMock()

        await router._on_session_a_tts(b"\x00\x01")

        assert router._echo_suppressed is True
        assert router.session_b.output_suppressed is True
        router.twilio_handler.send_audio.assert_called_once_with(b"\x00\x01")

    @pytest.mark.asyncio
    async def test_no_input_buffer_clear_on_cooldown(self):
        """v2: 쿨다운 완료 시 clear_input_buffer를 호출하지 않음 (오디오 폐기 방지)."""
        router = _make_router()
        router.session_b.clear_input_buffer = AsyncMock()
        router.session_b.flush_pending_output = AsyncMock()

        router._activate_echo_suppression()

        with patch("src.realtime.audio_router.settings") as mock_settings:
            mock_settings.echo_gate_cooldown_s = 0.05
            router._start_echo_cooldown()
            await asyncio.sleep(0.1)

        # clear_input_buffer는 더 이상 호출되지 않음
        router.session_b.clear_input_buffer.assert_not_called()


class TestSessionBOutputSuppression:
    """SessionB output_suppressed + pending output 큐 테스트."""

    def _make_handler(self) -> tuple[SessionBHandler, ActiveCall]:
        session_mock = MagicMock()
        session_mock.on = MagicMock()
        call = _make_call()
        handler = SessionBHandler(
            session=session_mock,
            call=call,
            on_translated_audio=AsyncMock(),
            on_caption=AsyncMock(),
            on_original_caption=AsyncMock(),
        )
        return handler, call

    @pytest.mark.asyncio
    async def test_audio_queued_when_suppressed(self):
        """억제 중 오디오가 큐에 저장됨."""
        handler, _ = self._make_handler()
        handler.output_suppressed = True

        import base64
        audio_b64 = base64.b64encode(b"\x00\x01\x02").decode()
        await handler._handle_audio_delta({"delta": audio_b64})

        assert len(handler._pending_output) == 1
        assert handler._pending_output[0][0] == "audio"
        handler._on_translated_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_caption_queued_when_suppressed(self):
        """억제 중 캡션이 큐에 저장됨."""
        handler, _ = self._make_handler()
        handler.output_suppressed = True

        await handler._handle_transcript_delta({"delta": "번역 텍스트"})

        assert len(handler._pending_output) == 1
        assert handler._pending_output[0] == ("caption", ("recipient", "번역 텍스트"))
        handler._on_caption.assert_not_called()

    @pytest.mark.asyncio
    async def test_transcript_always_saved_during_suppression(self):
        """억제 중에도 transcript는 항상 저장됨."""
        handler, call = self._make_handler()
        handler.output_suppressed = True

        await handler._handle_transcript_done({"transcript": "번역 완료"})

        assert len(call.transcript_bilingual) == 1
        assert call.transcript_bilingual[0].original_text == "번역 완료"

    @pytest.mark.asyncio
    async def test_speech_started_fires_during_suppression(self):
        """억제 중에도 수신자 발화 시작 이벤트가 발생함."""
        handler, _ = self._make_handler()
        handler._on_recipient_speech_started = AsyncMock()
        handler.output_suppressed = True

        await handler._handle_speech_started({})

        assert handler.is_recipient_speaking is True
        handler._on_recipient_speech_started.assert_called_once()

    @pytest.mark.asyncio
    async def test_flush_pending_output(self):
        """flush_pending_output이 큐를 올바르게 배출함."""
        handler, _ = self._make_handler()
        handler.output_suppressed = True

        import base64
        audio_b64 = base64.b64encode(b"\x00\x01").decode()
        await handler._handle_audio_delta({"delta": audio_b64})
        await handler._handle_transcript_delta({"delta": "텍스트"})

        assert len(handler._pending_output) == 2

        # 억제 해제 후 배출
        handler.output_suppressed = False
        await handler.flush_pending_output()

        assert len(handler._pending_output) == 0
        handler._on_translated_audio.assert_called_once()
        handler._on_caption.assert_called_once_with("recipient", "텍스트")

    @pytest.mark.asyncio
    async def test_original_caption_queued_when_suppressed(self):
        """억제 중 원문 캡션이 큐에 저장됨."""
        handler, _ = self._make_handler()
        handler.output_suppressed = True

        await handler._handle_input_transcription_completed({"transcript": "원문"})

        assert len(handler._pending_output) == 1
        assert handler._pending_output[0] == ("original_caption", ("recipient", "원문"))
        handler._on_original_caption.assert_not_called()

    def test_output_suppressed_toggle(self):
        """output_suppressed 프로퍼티 토글."""
        handler, _ = self._make_handler()
        assert handler.output_suppressed is False

        handler.output_suppressed = True
        assert handler.output_suppressed is True

        handler.output_suppressed = False
        assert handler.output_suppressed is False
