"""Ring Buffer — 30초 오디오 보관.

PRD 5.2:
  - 수신자 오디오를 항상 보관하는 안전망
  - Session B가 일시적으로 처리 불가 상태일 때 오디오 누락 방지
  - capacity: 30초 (g711_ulaw 8kHz = ~240KB)
  - chunkDuration: 20ms (Twilio 기본 패킷 크기)
  - slots: 1500 (30초 / 20ms)
  - 순환 구조: 30초 초과 시 가장 오래된 슬롯 덮어쓰기

상태 추적:
  - lastSentSequence: Session B에 마지막으로 전송한 시퀀스 번호
  - lastReceivedSequence: Twilio에서 마지막으로 수신한 시퀀스
  - gap = lastReceived - lastSent: 미전송 오디오 양
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# g711_ulaw 8kHz, 20ms chunk = 160 bytes per chunk
# 30 seconds / 20ms = 1500 slots
DEFAULT_CAPACITY_SLOTS = 1500
DEFAULT_CHUNK_DURATION_MS = 20


@dataclass
class AudioSlot:
    """Ring Buffer의 단일 오디오 슬롯."""

    data: bytes = b""
    sequence: int = 0
    timestamp: float = 0.0


class AudioRingBuffer:
    """순환 오디오 버퍼 — 최근 30초 오디오를 항상 보관한다.

    Twilio에서 수신한 모든 오디오를 기록하며,
    Session B 장애 시 미전송 구간을 추출할 수 있다.
    """

    def __init__(self, capacity: int = DEFAULT_CAPACITY_SLOTS):
        self._capacity = capacity
        self._slots: list[AudioSlot] = [AudioSlot() for _ in range(capacity)]
        self._write_pos: int = 0
        self._total_written: int = 0

        # 시퀀스 추적
        self.last_received_seq: int = 0
        self.last_sent_seq: int = 0

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def gap(self) -> int:
        """미전송 오디오 슬롯 수."""
        return self.last_received_seq - self.last_sent_seq

    @property
    def gap_ms(self) -> int:
        """미전송 오디오 길이 (밀리초)."""
        return self.gap * DEFAULT_CHUNK_DURATION_MS

    @property
    def total_written(self) -> int:
        return self._total_written

    def write(self, audio_data: bytes) -> int:
        """오디오 청크를 버퍼에 기록한다.

        Args:
            audio_data: g711_ulaw 오디오 바이트

        Returns:
            할당된 시퀀스 번호
        """
        self._total_written += 1
        seq = self._total_written

        slot = self._slots[self._write_pos]
        slot.data = audio_data
        slot.sequence = seq
        slot.timestamp = time.time()

        self.last_received_seq = seq
        self._write_pos = (self._write_pos + 1) % self._capacity

        return seq

    def mark_sent(self, sequence: int) -> None:
        """Session B에 성공적으로 전송된 시퀀스를 기록한다."""
        if sequence > self.last_sent_seq:
            self.last_sent_seq = sequence

    def get_unsent(self) -> list[AudioSlot]:
        """미전송 오디오 슬롯을 시퀀스 순서대로 반환한다.

        Returns:
            미전송 AudioSlot 리스트 (시퀀스 순서)
        """
        if self.gap <= 0:
            return []

        start_seq = self.last_sent_seq + 1
        end_seq = self.last_received_seq

        result: list[AudioSlot] = []
        for slot in self._slots:
            if start_seq <= slot.sequence <= end_seq and slot.data:
                result.append(slot)

        result.sort(key=lambda s: s.sequence)
        return result

    def get_unsent_audio_bytes(self) -> bytes:
        """미전송 오디오를 단일 바이트열로 결합한다.

        Whisper API 배치 처리에 사용된다.
        """
        unsent = self.get_unsent()
        return b"".join(slot.data for slot in unsent)

    def get_recent(self, duration_ms: int) -> list[AudioSlot]:
        """최근 N 밀리초의 오디오를 반환한다.

        Args:
            duration_ms: 가져올 오디오 길이 (밀리초)

        Returns:
            AudioSlot 리스트 (시퀀스 순서)
        """
        slot_count = min(
            duration_ms // DEFAULT_CHUNK_DURATION_MS,
            self._capacity,
            self._total_written,
        )

        if slot_count <= 0:
            return []

        cutoff_time = time.time() - (duration_ms / 1000.0)
        result: list[AudioSlot] = []
        for slot in self._slots:
            if slot.timestamp >= cutoff_time and slot.data:
                result.append(slot)

        result.sort(key=lambda s: s.sequence)
        return result[-slot_count:]

    def clear(self) -> None:
        """버퍼를 초기화한다."""
        for slot in self._slots:
            slot.data = b""
            slot.sequence = 0
            slot.timestamp = 0.0
        self._write_pos = 0
        self._total_written = 0
        self.last_received_seq = 0
        self.last_sent_seq = 0

    def __repr__(self) -> str:
        return (
            f"AudioRingBuffer(capacity={self._capacity}, "
            f"written={self._total_written}, "
            f"gap={self.gap}, "
            f"gap_ms={self.gap_ms}ms)"
        )
