"""EchoGateManager 단위 테스트.

EchoGateManager의 독립 동작을 검증한다:
  - Echo window 활성화/비활성화
  - filter_audio: 에너지 기반 필터링 + gate break
  - 동적 cooldown: max cap 적용/미적용
  - Post-echo settling: AGC 안정화 대기
  - on_recipient_speech: 즉시 해제 (settling 포함)
  - stop: cooldown task 취소
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.realtime.pipeline.echo_gate import EchoGateManager


def _make_call_metrics():
    """CallMetrics mock을 생성한다."""
    metrics = MagicMock()
    metrics.echo_suppressions = 0
    metrics.echo_gate_breakthroughs = 0
    return metrics


def _make_echo_gate(
    echo_margin_s: float = 0.3,
    max_echo_window_s: float | None = 1.2,
    settling_s: float = 2.0,
    break_on_high_energy: bool = True,
) -> tuple[EchoGateManager, MagicMock, MagicMock]:
    """EchoGateManager + mock session_b + mock call_metrics를 생성한다."""
    session_b = MagicMock()
    session_b.clear_input_buffer = AsyncMock()
    call_metrics = _make_call_metrics()
    gate = EchoGateManager(
        session_b=session_b,
        local_vad=None,
        call_metrics=call_metrics,
        echo_margin_s=echo_margin_s,
        max_echo_window_s=max_echo_window_s,
        settling_s=settling_s,
        break_on_high_energy=break_on_high_energy,
    )
    return gate, session_b, call_metrics


class TestEchoGateActivation:
    """Echo window 활성화/비활성화 테스트."""

    def test_initial_state(self):
        """초기 상태: echo window 비활성."""
        gate, _, _ = _make_echo_gate()
        assert gate.in_echo_window is False
        assert gate.is_suppressing is False

    def test_activate(self):
        """_activate() → in_echo_window = True."""
        gate, _, metrics = _make_echo_gate()
        gate._activate()
        assert gate.in_echo_window is True
        assert gate.is_suppressing is True
        assert metrics.echo_suppressions == 1

    def test_activate_idempotent(self):
        """이미 활성 상태에서 _activate() → 카운터 증가 없음."""
        gate, _, metrics = _make_echo_gate()
        gate._activate()
        gate._activate()
        assert metrics.echo_suppressions == 1

    def test_deactivate(self):
        """_deactivate() → in_echo_window = False + TTS 추적 리셋."""
        gate, _, _ = _make_echo_gate()
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 1000
        gate._activate()

        gate._deactivate()

        assert gate.in_echo_window is False
        assert gate._tts_first_chunk_at == 0.0
        assert gate._tts_total_bytes == 0

    def test_activate_cancels_existing_cooldown(self):
        """_activate() → 기존 cooldown task 취소."""
        gate, _, _ = _make_echo_gate()
        old_task = MagicMock()
        old_task.done.return_value = False
        gate._echo_cooldown_task = old_task

        gate._activate()

        old_task.cancel.assert_called_once()
        assert gate._echo_cooldown_task is None


class TestOnTtsChunk:
    """on_tts_chunk 메서드 테스트."""

    def test_first_chunk_returns_true(self):
        """첫 번째 청크 → True 반환 + echo window 활성화."""
        gate, _, _ = _make_echo_gate()
        result = gate.on_tts_chunk(100)
        assert result is True
        assert gate.in_echo_window is True
        assert gate._tts_total_bytes == 100

    def test_subsequent_chunks_return_false(self):
        """두 번째 이후 청크 → False 반환 + 바이트 누적."""
        gate, _, _ = _make_echo_gate()
        gate.on_tts_chunk(100)
        result = gate.on_tts_chunk(200)
        assert result is False
        assert gate._tts_total_bytes == 300


class TestFilterAudio:
    """filter_audio 메서드 테스트."""

    def test_passthrough_outside_echo_window(self):
        """Echo window 비활성 → 원본 그대로 전달."""
        gate, _, _ = _make_echo_gate()
        audio = bytes([0x10] * 160)
        result = gate.filter_audio(audio)
        assert result == audio

    def test_silence_during_echo_window_low_energy(self):
        """Echo window 중 저에너지 → mu-law silence(0xFF)."""
        gate, _, _ = _make_echo_gate()
        gate.in_echo_window = True
        audio = bytes([0xFE] * 160)  # 저에너지 (RMS ~2)
        result = gate.filter_audio(audio)
        assert all(b == 0xFF for b in result)
        assert len(result) == 160

    def test_high_rms_breaks_gate(self):
        """Echo window 중 고에너지 → gate break + 원본 전달."""
        gate, _, metrics = _make_echo_gate()
        gate.in_echo_window = True
        audio = bytes([0x10] * 160)  # 고에너지 (RMS ~3999)
        result = gate.filter_audio(audio)
        assert result == audio
        assert gate.in_echo_window is False
        assert metrics.echo_gate_breakthroughs == 1


class TestCooldown:
    """동적 cooldown 타이머 테스트."""

    @pytest.mark.asyncio
    async def test_cooldown_with_max_cap(self):
        """V2V: cooldown이 max_echo_window_s(1.2s)로 cap된다."""
        gate, session_b, _ = _make_echo_gate(echo_margin_s=0.3, max_echo_window_s=1.2)
        # 긴 TTS 시뮬레이션: 16000 bytes = 2.0s
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 16000
        gate._activate()

        gate.on_tts_done()
        # cooldown = min(2.0 + 0.3, 1.2) = 1.2s
        await asyncio.sleep(0.5)
        assert gate.in_echo_window is True  # 아직 cooldown 중
        await asyncio.sleep(1.0)
        assert gate.in_echo_window is False  # 1.2s 후 해제

    @pytest.mark.asyncio
    async def test_cooldown_without_max_cap(self):
        """T2V: max cap 없이 전체 cooldown 적용."""
        gate, session_b, _ = _make_echo_gate(echo_margin_s=0.5, max_echo_window_s=None)
        # 짧은 TTS: 800 bytes = 0.1s
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 800
        gate._activate()

        gate.on_tts_done()
        # cooldown = 0.1 + 0.5 = 0.6s (cap 없음)
        await asyncio.sleep(0.3)
        assert gate.in_echo_window is True
        await asyncio.sleep(0.6)
        assert gate.in_echo_window is False

    @pytest.mark.asyncio
    async def test_cooldown_clears_buffer_and_resets_vad(self):
        """Cooldown 완료 시 session_b.clear_input_buffer + local_vad.reset_state 호출."""
        local_vad = MagicMock()
        local_vad.reset_state = MagicMock()
        session_b = MagicMock()
        session_b.clear_input_buffer = AsyncMock()
        gate = EchoGateManager(
            session_b=session_b,
            local_vad=local_vad,
            call_metrics=_make_call_metrics(),
            echo_margin_s=0.1,
            max_echo_window_s=0.5,
        )
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 100
        gate._activate()

        gate.on_tts_done()
        await asyncio.sleep(0.8)

        assert gate.in_echo_window is False
        session_b.clear_input_buffer.assert_called_once()
        local_vad.reset_state.assert_called_once()

    @pytest.mark.asyncio
    async def test_settling_after_cooldown(self):
        """Echo window 종료 후 settling 기간 동안 is_suppressing = True."""
        gate, _, _ = _make_echo_gate(echo_margin_s=0.1, max_echo_window_s=0.5, settling_s=2.0)
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 100
        gate._activate()

        gate.on_tts_done()
        await asyncio.sleep(0.8)

        # Echo window는 닫혔지만 settling 중이므로 is_suppressing = True
        assert gate.in_echo_window is False
        assert gate.is_suppressing is True

    @pytest.mark.asyncio
    async def test_settling_expires(self):
        """Settling 만료 후 is_suppressing = False."""
        gate, _, _ = _make_echo_gate(echo_margin_s=0.1, max_echo_window_s=0.3, settling_s=0.5)
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 100
        gate._activate()

        gate.on_tts_done()
        await asyncio.sleep(0.5)  # cooldown 완료
        assert gate.in_echo_window is False
        assert gate.is_suppressing is True  # settling 중

        await asyncio.sleep(0.7)  # settling 만료
        assert gate.is_suppressing is False

    @pytest.mark.asyncio
    async def test_recipient_speech_clears_settling(self):
        """수신자 발화 → settling 즉시 해제."""
        gate, _, _ = _make_echo_gate(echo_margin_s=0.1, max_echo_window_s=0.3, settling_s=2.0)
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 100
        gate._activate()

        gate.on_tts_done()
        await asyncio.sleep(0.5)  # cooldown 완료, settling 중
        assert gate.in_echo_window is False
        assert gate.is_suppressing is True

        gate.on_recipient_speech()
        assert gate.is_suppressing is False
        assert gate._settling_until == 0.0


class TestRecipientSpeech:
    """수신자 발화 감지 테스트."""

    def test_on_recipient_speech_deactivates(self):
        """수신자 발화 → echo window 즉시 해제."""
        gate, _, _ = _make_echo_gate()
        gate._activate()
        assert gate.in_echo_window is True

        gate.on_recipient_speech()

        assert gate.in_echo_window is False
        assert gate._tts_first_chunk_at == 0.0
        assert gate._tts_total_bytes == 0

    def test_on_recipient_speech_cancels_cooldown(self):
        """수신자 발화 → 진행 중인 cooldown task 취소."""
        gate, _, _ = _make_echo_gate()
        task = MagicMock()
        task.done.return_value = False
        gate._echo_cooldown_task = task

        gate.on_recipient_speech()

        task.cancel.assert_called_once()
        assert gate._echo_cooldown_task is None


class TestStop:
    """stop() 리소스 정리 테스트."""

    @pytest.mark.asyncio
    async def test_stop_cancels_cooldown_task(self):
        """stop() → cooldown task 취소."""
        gate, _, _ = _make_echo_gate()
        gate._tts_first_chunk_at = time.time()
        gate._tts_total_bytes = 8000
        gate._activate()
        gate.on_tts_done()

        assert gate._echo_cooldown_task is not None

        await gate.stop()

        assert gate._echo_cooldown_task.cancelled()

    @pytest.mark.asyncio
    async def test_stop_noop_without_task(self):
        """cooldown task 없을 때 stop()은 안전하게 no-op."""
        gate, _, _ = _make_echo_gate()
        await gate.stop()  # 에러 없이 완료


class TestBreakOnHighEnergy:
    """break_on_high_energy 파라미터 테스트 (V2V vs T2V 동작 분리)."""

    def test_break_enabled_deactivates_on_high_rms(self):
        """break=True (V2V 기본값): high RMS → gate break + 원본 전달."""
        gate, _, metrics = _make_echo_gate(break_on_high_energy=True)
        gate.in_echo_window = True
        audio = bytes([0x10] * 160)  # 고에너지 (RMS ~3999)
        result = gate.filter_audio(audio)
        assert result == audio
        assert gate.in_echo_window is False
        assert metrics.echo_gate_breakthroughs == 1

    def test_break_disabled_keeps_gate_on_high_rms(self):
        """break=False (T2V): high RMS → gate 유지 + 무음 전달."""
        gate, _, metrics = _make_echo_gate(break_on_high_energy=False)
        gate.in_echo_window = True
        audio = bytes([0x10] * 160)  # 고에너지 (RMS ~3999)
        result = gate.filter_audio(audio)
        assert all(b == 0xFF for b in result)
        assert len(result) == 160
        assert gate.in_echo_window is True  # gate 유지
        assert metrics.echo_gate_breakthroughs == 0  # break 미발생

    def test_break_disabled_low_rms_still_silenced(self):
        """break=False: low RMS → 무음 (기존과 동일)."""
        gate, _, _ = _make_echo_gate(break_on_high_energy=False)
        gate.in_echo_window = True
        audio = bytes([0xFE] * 160)  # 저에너지 (RMS ~2)
        result = gate.filter_audio(audio)
        assert all(b == 0xFF for b in result)
        assert len(result) == 160
        assert gate.in_echo_window is True


class TestInEchoWindowProperty:
    """in_echo_window property setter 테스트."""

    def test_setter(self):
        """in_echo_window setter로 직접 상태 변경."""
        gate, _, _ = _make_echo_gate()
        gate.in_echo_window = True
        assert gate.in_echo_window is True
        assert gate.is_suppressing is True

        gate.in_echo_window = False
        assert gate.in_echo_window is False
        assert gate.is_suppressing is False
