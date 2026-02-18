"""EchoDetector 단위 테스트.

에너지 핑거프린트 기반 에코 감지 검증:
  - 동일 오디오 → 에코 감지
  - 다른 오디오 → 통과
  - 감쇠된 에코 → 감지
  - 다양한 딜레이 → 감지
  - 무음 → 통과
  - feature flag / 상태 관리
"""

import time
from unittest.mock import patch

import pytest

from src.realtime.audio_utils import _ULAW_TO_LINEAR, ulaw_rms
from src.realtime.echo_detector import EchoDetector


# --- 테스트 유틸리티 ---

def _make_audio_pattern(values: list[int], chunk_size: int = 160) -> list[bytes]:
    """mu-law 바이트 패턴으로 오디오 청크 리스트 생성.

    values의 각 요소는 해당 청크를 채울 mu-law 바이트 값 (0x00=큰 소리, 0xFF=무음).
    """
    return [bytes([v] * chunk_size) for v in values]


def _make_detector(**overrides) -> EchoDetector:
    """테스트용 EchoDetector 생성 (빠른 파라미터)."""
    defaults = dict(
        correlation_window_chunks=5,
        min_delay_chunks=2,
        max_delay_chunks=10,
        delay_step_chunks=1,
        echo_threshold=0.6,
        safety_cooldown_s=0.3,
        min_reference_energy=50.0,
    )
    defaults.update(overrides)
    return EchoDetector(**defaults)


def _feed_reference(detector: EchoDetector, chunks: list[bytes]) -> None:
    """TTS 청크들을 reference buffer에 기록."""
    for chunk in chunks:
        detector.record_sent_chunk(chunk)


def _check_echo(detector: EchoDetector, chunks: list[bytes]) -> list[bool]:
    """수신 청크들의 에코 판정 결과 리스트 반환."""
    return [detector.is_echo(chunk) for chunk in chunks]


# --- audio_utils 테스트 ---

class TestAudioUtils:
    """audio_utils.py의 유틸리티 함수 테스트."""

    def test_ulaw_decode_table_size(self):
        """디코딩 테이블이 256개 엔트리."""
        assert len(_ULAW_TO_LINEAR) == 256

    def test_ulaw_decode_silence(self):
        """mu-law 0xFF, 0x7F는 무음(0)."""
        assert _ULAW_TO_LINEAR[0xFF] == 0
        assert _ULAW_TO_LINEAR[0x7F] == 0

    def test_ulaw_rms_empty(self):
        """빈 오디오의 RMS는 0."""
        assert ulaw_rms(b"") == 0.0

    def test_ulaw_rms_silence(self):
        """무음(0xFF)의 RMS는 0."""
        assert ulaw_rms(bytes([0xFF] * 160)) == 0.0

    def test_ulaw_rms_loud(self):
        """큰 소리(0x00)의 RMS는 큰 값."""
        rms = ulaw_rms(bytes([0x00] * 160))
        assert rms > 1000


# --- Pearson Correlation 테스트 ---

class TestPearsonCorrelation:
    """EchoDetector._pearson_correlation 정적 메서드 테스트."""

    def test_identical_sequences(self):
        """동일 시퀀스 → r ≈ 1.0."""
        x = [100.0, 200.0, 300.0, 400.0, 500.0]
        r = EchoDetector._pearson_correlation(x, x)
        assert r > 0.99

    def test_scaled_sequences(self):
        """스케일된 시퀀스 (감쇠) → r ≈ 1.0 (Pearson 정규화)."""
        x = [100.0, 200.0, 300.0, 400.0, 500.0]
        y = [10.0, 20.0, 30.0, 40.0, 50.0]  # 10배 감쇠
        r = EchoDetector._pearson_correlation(x, y)
        assert r > 0.99

    def test_uncorrelated_sequences(self):
        """무관한 시퀀스 → |r| 낮음."""
        x = [100.0, 200.0, 300.0, 400.0, 500.0]
        y = [350.0, 150.0, 450.0, 250.0, 300.0]
        r = EchoDetector._pearson_correlation(x, y)
        assert abs(r) < 0.5

    def test_opposite_sequences(self):
        """반전 시퀀스 → r ≈ -1.0."""
        x = [100.0, 200.0, 300.0, 400.0, 500.0]
        y = [500.0, 400.0, 300.0, 200.0, 100.0]
        r = EchoDetector._pearson_correlation(x, y)
        assert r < -0.99

    def test_constant_sequence(self):
        """상수 시퀀스 → r = 0.0 (분산 0)."""
        x = [100.0, 100.0, 100.0, 100.0, 100.0]
        y = [200.0, 300.0, 400.0, 500.0, 600.0]
        r = EchoDetector._pearson_correlation(x, y)
        assert r == 0.0

    def test_empty_sequences(self):
        """빈 시퀀스 → r = 0.0."""
        assert EchoDetector._pearson_correlation([], []) == 0.0

    def test_length_mismatch(self):
        """길이 불일치 → r = 0.0."""
        assert EchoDetector._pearson_correlation([1.0, 2.0], [1.0]) == 0.0


# --- EchoDetector 핵심 기능 테스트 ---

class TestEchoDetector:
    """EchoDetector 에코 감지 기능 테스트."""

    def test_no_reference_returns_false(self):
        """Reference가 없으면 항상 False."""
        detector = _make_detector()
        audio = bytes([0x10] * 160)
        assert detector.is_echo(audio) is False

    def test_is_active_during_tts(self):
        """TTS 전송 중 is_active = True."""
        detector = _make_detector()
        assert detector.is_active is False

        detector.record_sent_chunk(bytes([0x10] * 160))
        assert detector.is_active is True

    def test_is_active_after_tts_done_within_cooldown(self):
        """TTS 완료 후 safety cooldown 내 is_active = True."""
        detector = _make_detector(safety_cooldown_s=1.0)
        detector.record_sent_chunk(bytes([0x10] * 160))
        detector.mark_tts_done()
        assert detector.is_active is True

    def test_is_active_false_after_cooldown(self):
        """Safety cooldown 후 is_active = False."""
        detector = _make_detector(safety_cooldown_s=0.01)
        detector.record_sent_chunk(bytes([0x10] * 160))
        detector.mark_tts_done()
        time.sleep(0.02)
        assert detector.is_active is False

    def test_echo_detected_same_pattern(self):
        """동일 패턴의 오디오 → 에코 감지."""
        detector = _make_detector(
            correlation_window_chunks=5,
            min_delay_chunks=2,
            max_delay_chunks=8,
            delay_step_chunks=1,
            echo_threshold=0.5,
        )

        # 에너지가 다양한 패턴 생성
        pattern_values = [0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70,
                          0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70]
        sent_chunks = _make_audio_pattern(pattern_values)

        # Reference로 기록
        _feed_reference(detector, sent_chunks)

        # 약간의 딜레이 후 동일 패턴 수신
        # min_delay=2이므로 2~8 청크 딜레이 범위 탐색
        # incoming에 먼저 빈 데이터를 넣어 딜레이 시뮬레이션
        delay_padding = _make_audio_pattern([0xFF] * 3)  # 3청크 딜레이 (무음)
        for chunk in delay_padding:
            detector.is_echo(chunk)

        # 동일 패턴 수신 → 에코 감지
        results = _check_echo(detector, sent_chunks[:8])
        # 충분한 데이터가 쌓인 후 에코 감지되어야 함
        assert any(results), f"Expected at least one echo detection, got {results}"

    def test_genuine_speech_passes(self):
        """완전히 다른 에너지 패턴 → 에코 아님 (통과)."""
        detector = _make_detector(
            correlation_window_chunks=5,
            min_delay_chunks=2,
            max_delay_chunks=8,
            delay_step_chunks=1,
            echo_threshold=0.5,
        )

        # TTS 패턴: 순차 증가 (monotonic)
        sent_pattern = [0x00, 0x04, 0x08, 0x0C, 0x10, 0x14, 0x18, 0x1C,
                        0x20, 0x24, 0x28, 0x2C, 0x30, 0x34, 0x38, 0x3C]
        _feed_reference(detector, _make_audio_pattern(sent_pattern))

        # 수신 패턴: 상수 에너지 (flat) — 순차 증가와 상관관계 0
        # 상수값 청크의 RMS는 모두 동일 → Pearson 분산 0 → r = 0
        recv_pattern = [0x20] * 16
        results = _check_echo(detector, _make_audio_pattern(recv_pattern))

        echo_count = sum(results)
        assert echo_count == 0, f"Expected 0 echo detections for flat speech, got {echo_count}"

    def test_silence_passes_through(self):
        """무음 청크는 에코가 아님 (min_reference_energy 미만)."""
        detector = _make_detector()

        # Reference 기록
        _feed_reference(detector, _make_audio_pattern([0x00, 0x10, 0x20] * 5))

        # 무음 수신
        silence = bytes([0xFF] * 160)
        assert detector.is_echo(silence) is False

    def test_not_active_returns_false(self):
        """is_active가 False면 에코 감지 불필요."""
        detector = _make_detector(safety_cooldown_s=0.01)

        # Reference 기록 후 종료
        _feed_reference(detector, _make_audio_pattern([0x00, 0x10] * 8))
        detector.mark_tts_done()
        time.sleep(0.02)  # cooldown 경과

        assert detector.is_active is False
        audio = bytes([0x00] * 160)
        assert detector.is_echo(audio) is False

    def test_reset_clears_state(self):
        """reset()이 모든 상태를 초기화."""
        detector = _make_detector()
        _feed_reference(detector, _make_audio_pattern([0x00] * 10))
        assert detector.is_active is True

        detector.reset()

        assert detector.is_active is False
        assert len(detector._reference_buffer) == 0
        assert len(detector._incoming_buffer) == 0

    def test_mark_tts_done_sets_timestamp(self):
        """mark_tts_done이 _tts_ended_at을 현재 시간으로 설정."""
        detector = _make_detector()
        detector.record_sent_chunk(bytes([0x10] * 160))
        assert detector._tts_active is True

        before = time.time()
        detector.mark_tts_done()
        after = time.time()

        assert detector._tts_active is False
        assert before <= detector._tts_ended_at <= after

    def test_insufficient_incoming_buffer(self):
        """incoming_buffer가 윈도우보다 작으면 False."""
        detector = _make_detector(correlation_window_chunks=10)

        # 충분한 reference
        _feed_reference(detector, _make_audio_pattern([0x00, 0x10] * 10))

        # 단 1개 청크만 수신 → 윈도우 부족
        audio = bytes([0x00] * 160)
        assert detector.is_echo(audio) is False

    def test_attenuated_echo_detected(self):
        """감쇠된 에코 (볼륨 작은 동일 패턴) → 감지.

        Pearson 정규화가 스케일 차이를 무시하므로 감쇠 에코도 감지.
        """
        detector = _make_detector(
            correlation_window_chunks=5,
            min_delay_chunks=2,
            max_delay_chunks=8,
            delay_step_chunks=1,
            echo_threshold=0.5,
        )

        # 크고 다양한 패턴 — mu-law에서 같은 에너지 "shape"를 가지도록
        # 실제 에코는 mu-law 인코딩 특성상 감쇠 시 비선형적이지만
        # 에너지 패턴의 상대적 변화(오르내림)는 유지됨
        sent_values = [0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70,
                       0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70]
        _feed_reference(detector, _make_audio_pattern(sent_values))

        # 딜레이 패딩
        for _ in range(3):
            detector.is_echo(bytes([0xFF] * 160))

        # 감쇠된 에코: 동일 패턴이지만 비트 시프트로 에너지 변화
        # mu-law 특성상 0x00→0x04, 0x10→0x14 등은 감쇠 에코와 유사한 패턴
        attenuated = [v + 4 if v + 4 < 0x80 else v for v in sent_values]
        results = _check_echo(detector, _make_audio_pattern(attenuated[:8]))

        # Pearson 정규화로 감쇠 무시 → 에코 감지
        assert any(results), f"Expected attenuated echo detection, got {results}"

    def test_short_tts_passes_through(self):
        """아주 짧은 TTS (<correlation_window) → reference 부족 → 모두 통과."""
        detector = _make_detector(correlation_window_chunks=10)

        # 3개 청크만 (10개 필요)
        _feed_reference(detector, _make_audio_pattern([0x00, 0x10, 0x20]))

        audio = bytes([0x00] * 160)
        assert detector.is_echo(audio) is False
