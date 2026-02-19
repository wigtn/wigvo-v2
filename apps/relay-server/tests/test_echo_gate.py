"""Echo Gate + Dynamic Energy Threshold + 오디오 에너지 게이트 테스트.

Echo Detector (feature flag on):
  - per-chunk 에너지 핑거프린트 기반 에코 감지
  - 출력 억제 없음 (genuine speech 즉시 통과)
  - TTS 종료 후 0.3s safety cooldown

레거시 Echo Window (feature flag off):
  - Dynamic Energy Threshold: echo window 중 높은 임계값으로 에코 필터
  - 수신자 직접 발화(RMS 500+)는 항상 통과

오디오 에너지 게이트:
  - mu-law 오디오 RMS 에너지 측정
  - 임계값 미만의 무음/소음 차단 (Whisper 환각 방지)
"""

import asyncio
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


def _make_router(echo_detector_enabled: bool = True) -> AudioRouter:
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
    dual.session_b.clear_input_buffer = AsyncMock()

    twilio_handler = MagicMock()
    twilio_handler.send_audio = AsyncMock()
    twilio_handler.send_clear = AsyncMock()

    app_ws_send = AsyncMock()

    with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
        mock_settings.guardrail_enabled = False
        mock_settings.ring_buffer_capacity_slots = 100
        mock_settings.echo_gate_cooldown_s = 0.3
        mock_settings.call_warning_ms = 480_000
        mock_settings.max_call_duration_ms = 600_000
        mock_settings.audio_energy_gate_enabled = False  # 테스트에서는 기본 비활성
        mock_settings.audio_energy_min_rms = 150.0
        mock_settings.echo_energy_threshold_rms = 400.0
        mock_settings.echo_detector_enabled = echo_detector_enabled
        mock_settings.echo_detector_threshold = 0.6
        mock_settings.echo_detector_safety_cooldown_s = 0.3
        mock_settings.echo_detector_min_delay_chunks = 4
        mock_settings.echo_detector_max_delay_chunks = 30
        mock_settings.echo_detector_correlation_window = 10
        router = AudioRouter(
            call=call,
            dual_session=dual,
            twilio_handler=twilio_handler,
            app_ws_send=app_ws_send,
        )

    return router


class TestEchoDetectorIntegration:
    """Echo Detector (feature flag on): per-chunk 에코 감지 통합 테스트."""

    def test_echo_detector_created_when_enabled(self):
        """feature flag on → EchoDetector 인스턴스 생성."""
        router = _make_router(echo_detector_enabled=True)
        assert router._echo_detector is not None

    def test_echo_detector_not_created_when_disabled(self):
        """feature flag off → EchoDetector 없음 (레거시 모드)."""
        router = _make_router(echo_detector_enabled=False)
        assert router._echo_detector is None

    @pytest.mark.asyncio
    async def test_tts_records_fingerprint(self):
        """TTS 콜백 시 EchoDetector에 fingerprint 기록 (출력 억제 없음)."""
        router = _make_router(echo_detector_enabled=True)
        router.interrupt = MagicMock()
        router.interrupt.is_recipient_speaking = False

        await router._on_session_a_tts(b"\x00\x01\x02" * 50)

        # EchoDetector에 기록됨
        assert router._echo_detector.is_active is True
        assert len(router._echo_detector._reference_buffer) == 1
        # 출력 억제 없음 (기존 v3에서는 True였음)
        assert router.session_b.output_suppressed is not True

    @pytest.mark.asyncio
    async def test_tts_done_marks_detector(self):
        """Session A 응답 완료 시 mark_tts_done 호출 (2.5s 쿨다운 없음)."""
        router = _make_router(echo_detector_enabled=True)
        router._echo_detector.record_sent_chunk(b"\x00" * 160)

        await router._on_session_a_done()

        assert router._echo_detector._tts_active is False
        assert router._echo_detector._tts_ended_at > 0

    @pytest.mark.asyncio
    async def test_genuine_speech_passes_during_tts(self):
        """TTS 중에도 genuine speech는 Session B로 통과."""
        router = _make_router(echo_detector_enabled=True)
        router.session_b.send_recipient_audio = AsyncMock()

        # TTS 기록 (reference)
        for _ in range(15):
            router._echo_detector.record_sent_chunk(bytes([0x00] * 160))

        # 완전히 다른 패턴의 genuine speech
        speech = bytes([0x70] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = False
            await router.handle_twilio_audio(speech)

        # genuine speech → 통과
        router.session_b.send_recipient_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_recipient_speech_not_blocked_during_tts(self):
        """Echo Detector 활성 중에도 수신자 발화 이벤트 정상 처리."""
        router = _make_router(echo_detector_enabled=True)
        router._echo_detector.record_sent_chunk(bytes([0x00] * 160))

        # First message mock
        router.first_message = MagicMock()
        router.first_message.on_recipient_speech_detected = AsyncMock()
        router.call.first_message_sent = False

        await router._on_recipient_started()

        # 에코 감지 중에도 수신자 발화 이벤트 처리됨 (기존은 무시)
        router.first_message.on_recipient_speech_detected.assert_called_once()

    @pytest.mark.asyncio
    async def test_recipient_interrupt_not_blocked_during_tts(self):
        """Echo Detector 활성 중에도 interrupt 이벤트 정상 처리."""
        router = _make_router(echo_detector_enabled=True)
        router._echo_detector.record_sent_chunk(bytes([0x00] * 160))

        router.interrupt = MagicMock()
        router.interrupt.on_recipient_speech_started = AsyncMock()
        router.call.first_message_sent = True

        await router._on_recipient_started()

        # interrupt 정상 처리 (기존은 무시)
        router.interrupt.on_recipient_speech_started.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_resets_echo_detector(self):
        """AudioRouter.stop()이 EchoDetector를 reset."""
        router = _make_router(echo_detector_enabled=True)
        router._echo_detector.record_sent_chunk(bytes([0x00] * 160))
        assert router._echo_detector.is_active is True

        await router.stop()

        assert router._echo_detector.is_active is False


class TestLegacyEchoGate:
    """레거시 Echo Window (feature flag off): Dynamic Energy Threshold 테스트."""

    def test_echo_window_activates_on_tts(self):
        """TTS 콜백 시 _in_echo_window = True."""
        router = _make_router(echo_detector_enabled=False)
        assert router._in_echo_window is False

        router._activate_echo_window()

        assert router._in_echo_window is True

    @pytest.mark.asyncio
    async def test_echo_window_deactivates_after_cooldown(self):
        """쿨다운 후 _in_echo_window = False."""
        router = _make_router(echo_detector_enabled=False)

        router._activate_echo_window()
        assert router._in_echo_window is True

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.echo_gate_cooldown_s = 0.05  # 빠른 테스트
            router._start_echo_cooldown()
            await asyncio.sleep(0.1)

        assert router._in_echo_window is False

    def test_echo_cooldown_reset_on_new_tts(self):
        """새 TTS 시작 시 기존 쿨다운 타이머가 취소."""
        router = _make_router(echo_detector_enabled=False)

        old_task = MagicMock()
        old_task.done.return_value = False
        old_task.cancel = MagicMock()
        router._echo_cooldown_task = old_task

        router._activate_echo_window()

        old_task.cancel.assert_called_once()
        assert router._echo_cooldown_task is None

    @pytest.mark.asyncio
    async def test_tts_uses_legacy_on_flag_off(self):
        """feature flag off: TTS 시 _activate_echo_window 호출."""
        router = _make_router(echo_detector_enabled=False)
        router.interrupt = MagicMock()
        router.interrupt.is_recipient_speaking = False

        await router._on_session_a_tts(b"\x00\x01")

        assert router._in_echo_window is True

    @pytest.mark.asyncio
    async def test_done_uses_legacy_cooldown_on_flag_off(self):
        """feature flag off: 응답 완료 시 _start_echo_cooldown 호출."""
        router = _make_router(echo_detector_enabled=False)

        router._activate_echo_window()

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.echo_gate_cooldown_s = 0.05
            await router._on_session_a_done()
            await asyncio.sleep(0.1)

        assert router._in_echo_window is False


class TestDynamicEnergyThreshold:
    """Dynamic Energy Threshold: echo window 중 에너지 기반 에코 필터링 테스트."""

    @pytest.mark.asyncio
    async def test_low_energy_filtered_during_echo_window(self):
        """echo window + 낮은 RMS → 에코로 필터됨."""
        router = _make_router(echo_detector_enabled=False)
        router.session_b.send_recipient_audio = AsyncMock()
        router._in_echo_window = True

        # 무음~에코 수준 오디오 (RMS < 400)
        low_energy = bytes([0xFF] * 160)  # mu-law silence → RMS 0

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = True
            mock_settings.audio_energy_min_rms = 20.0
            mock_settings.echo_energy_threshold_rms = 400.0
            await router.handle_twilio_audio(low_energy)

        router.session_b.send_recipient_audio.assert_not_called()

    @pytest.mark.asyncio
    async def test_high_energy_passes_during_echo_window(self):
        """echo window + 높은 RMS → 수신자 발화로 통과."""
        router = _make_router(echo_detector_enabled=False)
        router.session_b.send_recipient_audio = AsyncMock()
        router._in_echo_window = True

        # 높은 에너지 오디오 (RMS > 400) — mu-law 0x00 = 최대 진폭
        loud_speech = bytes([0x00] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = True
            mock_settings.audio_energy_min_rms = 20.0
            mock_settings.echo_energy_threshold_rms = 400.0
            await router.handle_twilio_audio(loud_speech)

        router.session_b.send_recipient_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_normal_threshold_outside_echo_window(self):
        """echo window 외 → 낮은 임계값(audio_energy_min_rms)만 적용."""
        router = _make_router(echo_detector_enabled=False)
        router.session_b.send_recipient_audio = AsyncMock()
        router._in_echo_window = False

        # RMS ~100-300 수준의 중간 에너지 (에코 수준이지만 echo window 밖)
        mid_energy = bytes([0x10] * 160)

        with patch("src.realtime.pipeline.voice_to_voice.settings") as mock_settings:
            mock_settings.audio_energy_gate_enabled = True
            mock_settings.audio_energy_min_rms = 20.0
            mock_settings.echo_energy_threshold_rms = 400.0
            await router.handle_twilio_audio(mid_energy)

        # echo window 밖이므로 낮은 임계값 적용 → 통과
        router.session_b.send_recipient_audio.assert_called_once()

    @pytest.mark.asyncio
    async def test_speech_started_processed_during_echo_window(self):
        """echo window 중에도 speech_started는 정상 처리됨."""
        router = _make_router(echo_detector_enabled=False)
        router._in_echo_window = True

        router.first_message = MagicMock()
        router.first_message.on_recipient_speech_detected = AsyncMock()
        router.call.first_message_sent = False

        await router._on_recipient_started()

        # Dynamic threshold가 에코를 필터하므로, speech_started는 항상 genuine speech
        router.first_message.on_recipient_speech_detected.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_output_suppression_during_echo_window(self):
        """echo window가 output_suppressed를 토글하지 않음."""
        router = _make_router(echo_detector_enabled=False)

        router._activate_echo_window()

        assert router._in_echo_window is True
        # output_suppressed는 토글되지 않아야 함
        assert router.session_b.output_suppressed is not True


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
            mock_settings.echo_energy_threshold_rms = 400.0
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
            mock_settings.echo_energy_threshold_rms = 400.0
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
            mock_settings.audio_energy_min_rms = 150.0
            mock_settings.echo_energy_threshold_rms = 400.0
            await router.handle_twilio_audio(silence)

        router.session_b.send_recipient_audio.assert_called_once()
