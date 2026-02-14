"""Ring Buffer tests -- 30-second audio retention + unsent tracking."""

import pytest
from src.realtime.ring_buffer import AudioRingBuffer


class TestAudioRingBuffer:
    def test_write_and_sequence(self):
        """Writing audio increments the sequence number."""
        buf = AudioRingBuffer(capacity=10)
        seq1 = buf.write(b"\x00" * 160)
        seq2 = buf.write(b"\x01" * 160)
        assert seq1 == 1
        assert seq2 == 2
        assert buf.total_written == 2
        assert buf.last_received_seq == 2

    def test_mark_sent(self):
        """Marking sent reduces the gap."""
        buf = AudioRingBuffer(capacity=10)
        buf.write(b"\x00" * 160)
        buf.write(b"\x01" * 160)
        buf.write(b"\x02" * 160)
        assert buf.gap == 3

        buf.mark_sent(2)
        assert buf.gap == 1
        assert buf.last_sent_seq == 2

    def test_get_unsent(self):
        """Unsent audio is returned in sequence order."""
        buf = AudioRingBuffer(capacity=10)
        buf.write(b"\x00" * 160)
        buf.write(b"\x01" * 160)
        buf.write(b"\x02" * 160)
        buf.mark_sent(1)

        unsent = buf.get_unsent()
        assert len(unsent) == 2
        assert unsent[0].sequence == 2
        assert unsent[1].sequence == 3

    def test_circular_overflow(self):
        """Circular overwrite works when capacity is exceeded."""
        buf = AudioRingBuffer(capacity=3)
        for i in range(5):
            buf.write(bytes([i]) * 160)

        assert buf.total_written == 5
        assert buf.capacity == 3
        # Only the most recent 3 slots are valid
        recent = buf.get_recent(60)  # 60ms = 3 slots
        assert len(recent) <= 3

    def test_gap_ms(self):
        """gap_ms equals unsent slot count * 20ms."""
        buf = AudioRingBuffer(capacity=100)
        for _ in range(10):
            buf.write(b"\x00" * 160)
        buf.mark_sent(5)
        assert buf.gap == 5
        assert buf.gap_ms == 100  # 5 * 20ms

    def test_get_unsent_audio_bytes(self):
        """Unsent audio is combined into a single byte string."""
        buf = AudioRingBuffer(capacity=10)
        buf.write(b"\xAA" * 160)
        buf.write(b"\xBB" * 160)
        buf.mark_sent(1)

        combined = buf.get_unsent_audio_bytes()
        assert combined == b"\xBB" * 160

    def test_clear(self):
        """clear() resets all state."""
        buf = AudioRingBuffer(capacity=10)
        buf.write(b"\x00" * 160)
        buf.mark_sent(1)
        buf.clear()

        assert buf.total_written == 0
        assert buf.gap == 0
        assert buf.last_received_seq == 0
        assert buf.last_sent_seq == 0
