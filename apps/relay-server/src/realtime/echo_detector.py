"""에너지 핑거프린트 기반 에코 감지기.

TTS로 보낸 오디오의 에너지 패턴(fingerprint)을 기록하고,
Twilio에서 돌아오는 오디오와 비교하여 에코 여부를 판별한다.

핵심 원리:
  - 에코 = 보낸 오디오의 지연+감쇠 복사본 → 에너지 패턴 상관관계 높음
  - 실제 발화 = 다른 사람의 완전 다른 패턴 → 상관관계 낮음
  - Pearson 정규화로 감쇠(10~30dB) 차이 무관하게 패턴만 비교
"""

import logging
import time
from collections import deque

from src.realtime.audio_utils import ulaw_rms

logger = logging.getLogger(__name__)


class EchoDetector:
    """에너지 핑거프린트 기반 에코 감지기."""

    def __init__(
        self,
        correlation_window_chunks: int = 10,
        min_delay_chunks: int = 4,
        max_delay_chunks: int = 30,
        delay_step_chunks: int = 2,
        echo_threshold: float = 0.6,
        safety_cooldown_s: float = 0.3,
        min_reference_energy: float = 50.0,
    ):
        """
        Args:
            correlation_window_chunks: 비교 윈도우 크기 (10 = 200ms @ 20ms/chunk)
            min_delay_chunks: 최소 에코 딜레이 (4 = 80ms)
            max_delay_chunks: 최대 에코 딜레이 (30 = 600ms)
            delay_step_chunks: 딜레이 탐색 간격 (2 = 40ms)
            echo_threshold: Pearson 상관계수 임계값 (0.6)
            safety_cooldown_s: TTS 종료 후 안전 마진 (0.3s)
            min_reference_energy: 무음 구간 스킵 RMS 임계값 (50.0)
        """
        self._correlation_window = correlation_window_chunks
        self._min_delay = min_delay_chunks
        self._max_delay = max_delay_chunks
        self._delay_step = delay_step_chunks
        self._echo_threshold = echo_threshold
        self._safety_cooldown_s = safety_cooldown_s
        self._min_reference_energy = min_reference_energy

        # Reference buffer: TTS로 보낸 청크의 (timestamp, rms) — 최근 10초
        self._reference_buffer: deque[tuple[float, float]] = deque(maxlen=500)
        # Incoming buffer: 수신 청크의 RMS — 상관관계 계산용
        self._incoming_buffer: deque[float] = deque(
            maxlen=max_delay_chunks + correlation_window_chunks + 10
        )

        self._tts_active: bool = False
        self._tts_ended_at: float = 0.0

    @property
    def is_active(self) -> bool:
        """TTS 전송 중이거나 안전 마진 내인지 확인."""
        if self._tts_active:
            return True
        if self._tts_ended_at > 0:
            elapsed = time.time() - self._tts_ended_at
            return elapsed < self._safety_cooldown_s
        return False

    def record_sent_chunk(self, audio_bytes: bytes) -> None:
        """TTS로 보내는 청크의 에너지를 reference buffer에 기록."""
        rms = ulaw_rms(audio_bytes)
        self._reference_buffer.append((time.time(), rms))
        self._tts_active = True

    def mark_tts_done(self) -> None:
        """TTS 전송 완료 시점을 기록."""
        self._tts_active = False
        self._tts_ended_at = time.time()

    def is_echo(self, audio_bytes: bytes) -> bool:
        """수신 청크가 에코인지 판별.

        Returns:
            True: 에코로 판정 → 드롭
            False: genuine speech → 통과
        """
        # Reference가 없으면 에코일 수 없음
        if len(self._reference_buffer) < self._correlation_window:
            return False

        # is_active가 아니면 에코 감지 불필요
        if not self.is_active:
            return False

        incoming_rms = ulaw_rms(audio_bytes)

        # 무음은 에코가 아님 (에너지 게이트가 별도 처리)
        if incoming_rms < self._min_reference_energy:
            self._incoming_buffer.append(incoming_rms)
            return False

        self._incoming_buffer.append(incoming_rms)

        # incoming_buffer에 윈도우만큼 데이터가 쌓일 때까지 대기
        if len(self._incoming_buffer) < self._correlation_window:
            return False

        # Reference RMS 시퀀스 추출
        ref_rms_list = [rms for _, rms in self._reference_buffer]

        # 다양한 딜레이 오프셋에서 상관관계 테스트
        max_corr = -1.0
        incoming_window = list(self._incoming_buffer)[-self._correlation_window :]

        for delay in range(
            self._min_delay, self._max_delay + 1, self._delay_step
        ):
            # reference에서 delay만큼 이전 위치의 윈도우
            ref_end = len(ref_rms_list) - delay
            ref_start = ref_end - self._correlation_window

            if ref_start < 0:
                continue

            ref_window = ref_rms_list[ref_start:ref_end]

            corr = self._pearson_correlation(ref_window, incoming_window)
            if corr > max_corr:
                max_corr = corr

        is_echo = max_corr > self._echo_threshold
        if is_echo:
            logger.debug(
                "Echo detected: correlation=%.3f (threshold=%.3f)",
                max_corr,
                self._echo_threshold,
            )
        return is_echo

    def reset(self) -> None:
        """상태 초기화."""
        self._reference_buffer.clear()
        self._incoming_buffer.clear()
        self._tts_active = False
        self._tts_ended_at = 0.0

    @staticmethod
    def _pearson_correlation(x: list[float], y: list[float]) -> float:
        """두 시퀀스의 Pearson 정규화 상관계수를 계산.

        Returns:
            -1.0 ~ 1.0 사이 상관계수. 계산 불가 시 0.0 반환.
        """
        n = len(x)
        if n == 0 or n != len(y):
            return 0.0

        mean_x = sum(x) / n
        mean_y = sum(y) / n

        dx = [xi - mean_x for xi in x]
        dy = [yi - mean_y for yi in y]

        num = sum(dxi * dyi for dxi, dyi in zip(dx, dy))
        den_x = sum(dxi ** 2 for dxi in dx) ** 0.5
        den_y = sum(dyi ** 2 for dyi in dy) ** 0.5

        if den_x < 1e-10 or den_y < 1e-10:
            return 0.0

        return num / (den_x * den_y)
