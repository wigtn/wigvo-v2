"""링 버퍼 성능 벤치마크. 서버 불필요 — 모듈 직접 import."""

import time

from src.realtime.ring_buffer import AudioRingBuffer
from scripts.tests.helpers import ok, header


async def run() -> bool:
    header("Ring Buffer 성능 테스트")

    buf = AudioRingBuffer(capacity=1500)  # 30초
    chunk = b"\x00" * 160  # 20ms g711_ulaw

    # 30초 분량 쓰기 (1500 chunks)
    start = time.perf_counter()
    for _ in range(1500):
        buf.write(chunk)
    elapsed = (time.perf_counter() - start) * 1000

    ok(f"1500 chunks (30초) 쓰기: {elapsed:.2f}ms")

    # 절반 전송 마킹
    buf.mark_sent(750)
    unsent = buf.get_unsent()
    ok(f"미전송 {len(unsent)} chunks (gap={buf.gap_ms}ms)")

    # 미전송 바이트 추출
    start = time.perf_counter()
    audio_bytes = buf.get_unsent_audio_bytes()
    elapsed = (time.perf_counter() - start) * 1000
    ok(f"미전송 바이트 추출: {len(audio_bytes)} bytes in {elapsed:.2f}ms")

    return True
