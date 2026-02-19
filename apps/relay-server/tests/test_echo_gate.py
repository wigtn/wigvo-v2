"""Echo Gate + Silence Injection + 오디오 에너지 게이트 테스트.

Echo Gate (Silence Injection):
  - TTS 전송 중 + 동적 cooldown 구간에서 Twilio 오디오를 무음(0xFF)으로 대체
  - 완전 차단 대신 무음 전송 → VAD가 speech_stopped을 정상 감지
  - Echo window 중 speech_started/stopped 이벤트 무시 (에코 반응 방지)

동적 Cooldown:
  - TTS 길이에 비례하는 cooldown = 남은 재생 시간 + 에코 왕복 마진(0.5s)
  - 짧은 TTS("네") → ~0.8s cooldown, 긴 TTS → ~3s cooldown

오디오 에너지 게이트:
  - mu-law 오디오 RMS 에너지 측정
  - 임계값 미만의 무음/소음 차단 (Whisper 환각 방지)
"""

import asyncio
import base64
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.audio_router import AudioRouter
from src.realtime.audio_utils import _ULAW_TO_LINEAR, ulaw_rms as _ulaw_rms
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
    """최소한의 mock으로 AudioRouter 인스턴스를 생성한다."""
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
    dual.session_b.clear_input_buffer = AsyncMock()

    twilio_handler = MagicMock()
    twilio_handler.send_audio = AsyncMock()
    twilio_handler.send_clear = AsyncMock()

    app_ws_send = AsyncMock()

    with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
        mock_settings.guardrail_enabled = False
        mock_settings.ring_buffer_capacity_slots = 100
        mock_settings.call_warning_ms = 480_000
        mock_settings.max_call_duration_ms = 600_000
        mock_settings.audio_energy_gate_enabled = False  # 테스트에서는 기본 비활성
        mock_settings.audio_energy_min_rms = 150.0
        mock_settings.echo_energy_threshold_rms = 400.0
        mock_settings.local_vad_enabled = False  # 테스트에서는 Server VAD 사용
        router = AudioRouter(
            call=call,
            dual_session=dual,
            twilio_handler=twilio_handler,
            app_ws_send=app_ws_send,
        )

    return router


class TestEchoGate:
    """Echo Gate: echo window 활성화/비활성화 + 동적 cooldown 테스트."""

    def test_echo_window_activates(self):
        """_activate_echo_window 호출 시 _in_echo_window = True."""
        router = _make_router()
        assert router._pipeline._in_echo_window is False

        router._activate_echo_window()

        assert router._pipeline._in_echo_window is True

    @pytest.mark.asyncio
    async def test_echo_window_deactivates_after_dynamic_cooldown(self):
        """동적 cooldown 후 _in_echo_window = False."""
        router = _make_router()

        # TTS 길이 시뮬레이션: 800 bytes = 0.1s of audio @ 8kHz
        router._pipeline._tts_first_chunk_at = time.time()
        router._pipeline._tts_total_bytes = 800

        router._activate_echo_window()
        assert router._pipeline._in_echo_window is True

        router._start_echo_cooldown()
        # 동적 cooldown: remaining(0.1s) + margin(0.5s) ≈ 0.6s
        await asyncio.sleep(1.0)

        assert router._pipeline._in_echo_window is False

    def test_echo_cooldown_reset_on_new_tts(self):
        """새 TTS 시작 시 기존 쿨다운 타이머가 취소."""
        router = _make_router()

        old_task = MagicMock()
        old_task.done.return_value = False
        old_task.cancel = MagicMock()
        router._pipeline._echo_cooldown_task = old_task

        router._activate_echo_window()

        old_task.cancel.assert_called_once()
        assert router._pipeline._echo_cooldown_task is None

    @pytest.mark.asyncio
    async def test_tts_activates_echo_window(self):
        """_on_session_a_tts 호출 시 echo window 활성화."""
        router = _make_router()
        router.interrupt = MagicMock()
        router.interrupt.is_recipient_speaking = False

        await router._on_session_a_tts(b"\x00\x01")

        assert router._pipeline._in_echo_window is True

    @pytest.mark.asyncio
    async def test_done_starts_dynamic_cooldown(self):
        """응답 완료 시 동적 cooldown이 시작된다."""
        router = _make_router()

        # TTS 추적값 설정 (짧은 TTS)
        router._pipeline._tts_first_chunk_at = time.time()
        router._pipeline._tts_total_bytes = 400  # 0.05s of audio

        router._activate_echo_window()
        await router._on_session_a_done()

        # cooldown task가 생성됨
        assert router._pipeline._echo_cooldown_task is not None
        # 짧은 TTS → 빠른 cooldown (0.05 + 0.5 = 0.55s)
        await asyncio.sleep(1.0)
        assert router._pipeline._in_echo_window is False


class TestSilenceInjection:
    """Silence Injection: echo window 중 무음 대체 + 이벤트 무시 테스트."""

    @pytest.mark.asyncio
    async def test_silence_injected_during_echo_window(self):
        """echo window 중 Twilio 오디오가 무음(0xFF)으로 대체되어 Session B에 전송."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()
        router._pipeline._in_echo_window = True

        audio = bytes([0x10] * 160)  # 실제 오디오 (에코)
        await router.handle_twilio_audio(audio)

        # 무음(0xFF)이 Session B에 전송됨
        router.session_b.send_recipient_audio.assert_called_once()
        sent_b64 = router.session_b.send_recipient_audio.call_args[0][0]
        sent_bytes = base64.b64decode(sent_b64)
        assert all(b == 0xFF for b in sent_bytes)
        assert len(sent_bytes) == 160

    @pytest.mark.asyncio
    async def test_real_audio_passes_outside_echo_window(self):
        """echo window 외 → 실제 오디오가 Session B에 전송."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()
        router._pipeline._in_echo_window = False

        audio = bytes([0x10] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = False
            await router.handle_twilio_audio(audio)

        router.session_b.send_recipient_audio.assert_called_once()
        sent_b64 = router.session_b.send_recipient_audio.call_args[0][0]
        sent_bytes = base64.b64decode(sent_b64)
        assert sent_bytes == audio

    @pytest.mark.asyncio
    async def test_speech_started_ignored_during_echo_window(self):
        """echo window 중 speech_started는 무시된다 (에코 반응 방지)."""
        router = _make_router()
        router._pipeline._in_echo_window = True

        router.first_message = MagicMock()
        router.first_message.on_recipient_speech_detected = AsyncMock()
        router.call.first_message_sent = False

        await router._on_recipient_started()

        # echo window 중에는 무시
        router.first_message.on_recipient_speech_detected.assert_not_called()

    @pytest.mark.asyncio
    async def test_speech_stopped_ignored_during_echo_window(self):
        """echo window 중 speech_stopped는 무시된다."""
        router = _make_router()
        router._pipeline._in_echo_window = True

        router.interrupt = MagicMock()
        router.interrupt.on_recipient_speech_stopped = AsyncMock()
        router.context_manager = MagicMock()
        router.context_manager.inject_context = AsyncMock()

        await router._on_recipient_stopped()

        # echo window 중에는 무시
        router.interrupt.on_recipient_speech_stopped.assert_not_called()
        router.context_manager.inject_context.assert_not_called()

    @pytest.mark.asyncio
    async def test_speech_processed_outside_echo_window(self):
        """echo window 외 speech_started는 정상 처리됨."""
        router = _make_router()
        router._pipeline._in_echo_window = False

        router.first_message = MagicMock()
        router.first_message.on_recipient_speech_detected = AsyncMock()
        router.call.first_message_sent = False

        await router._on_recipient_started()

        router.first_message.on_recipient_speech_detected.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_output_suppression_during_echo_window(self):
        """echo window가 output_suppressed를 토글하지 않음."""
        router = _make_router()

        router._activate_echo_window()

        assert router._pipeline._in_echo_window is True
        # output_suppressed는 토글되지 않아야 함
        assert router.session_b.output_suppressed is not True


class TestSessionBOutputSuppression:
    """SessionB output_suppressed + pending output 큐 테스트."""

    def _make_handler(self) -> tuple[SessionBHandler, ActiveCall]:
        session_mock = MagicMock()
        session_mock.on = MagicMock()
        session_mock.create_response = AsyncMock()  # silence timeout 안전
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

        audio_b64 = base64.b64encode(b"\x00\x01").decode()
        await handler._handle_audio_delta({"delta": audio_b64})
        await handler._handle_transcript_delta({"delta": "텍스트"})

        assert len(handler._pending_output) == 2

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


class TestUlawRmsAndEnergyGate:
    """mu-law RMS 에너지 계산 + 오디오 에너지 게이트 테스트."""

    def test_ulaw_decode_table_silence(self):
        """mu-law 0xFF, 0x7F는 무음(0)으로 디코딩."""
        assert _ULAW_TO_LINEAR[0xFF] == 0
        assert _ULAW_TO_LINEAR[0x7F] == 0

    def test_ulaw_decode_table_range(self):
        """디코딩 테이블이 256개 엔트리를 가짐."""
        assert len(_ULAW_TO_LINEAR) == 256

    def test_ulaw_rms_silence(self):
        """무음 바이트(0xFF)의 RMS는 0."""
        silence = bytes([0xFF] * 160)
        assert _ulaw_rms(silence) == 0.0

    def test_ulaw_rms_empty(self):
        """빈 오디오의 RMS는 0."""
        assert _ulaw_rms(b"") == 0.0

    def test_ulaw_rms_loud_audio(self):
        """큰 소리 오디오는 높은 RMS 값."""
        loud = bytes([0x00] * 160)
        rms = _ulaw_rms(loud)
        assert rms > 1000

    def test_ulaw_rms_mixed(self):
        """혼합 오디오는 중간 RMS."""
        mixed = bytes([0xFF] * 80 + [0x00] * 80)
        rms = _ulaw_rms(mixed)
        assert 0 < rms < _ulaw_rms(bytes([0x00] * 160))

    @pytest.mark.asyncio
    async def test_energy_gate_blocks_silence(self):
        """에너지 게이트 활성 시 무음 오디오가 Session B에 전달되지 않음."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()

        silence = bytes([0xFF] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = True
            mock_settings.audio_energy_min_rms = 150.0
            await router.handle_twilio_audio(silence)

        router.session_b.send_recipient_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_energy_gate_passes_speech(self):
        """에너지 게이트 활성 시 발화 오디오는 Session B에 전달됨."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()

        speech = bytes([0x10] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = True
            mock_settings.audio_energy_min_rms = 150.0
            await router.handle_twilio_audio(speech)

        router.session_b.send_recipient_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_energy_gate_disabled_passes_all(self):
        """에너지 게이트 비활성 시 모든 오디오가 Session B에 전달됨."""
        router = _make_router()
        router.session_b.send_recipient_audio = AsyncMock()

        silence = bytes([0xFF] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = False
            await router.handle_twilio_audio(silence)

        router.session_b.send_recipient_audio.assert_called_once()
