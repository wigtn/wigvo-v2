"""G.711 mu-law 오디오 유틸리티.

audio_router와 echo_detector가 공유하는 mu-law 디코딩/에너지 계산 함수.
circular import 방지를 위해 별도 모듈로 분리.
"""

# G.711 mu-law -> linear PCM 디코딩 테이블 (256 entries)
_ULAW_TO_LINEAR: list[int] = []
for _byte in range(256):
    _b = ~_byte & 0xFF
    _sign = (_b >> 7) & 1
    _exp = (_b >> 4) & 0x07
    _man = _b & 0x0F
    _mag = ((2 * _man + 33) << _exp) - 33
    _ULAW_TO_LINEAR.append(-_mag if _sign else _mag)


def pcm16_rms(audio: bytes) -> float:
    """PCM16 (16-bit signed LE) 오디오의 RMS 에너지를 계산한다.

    Returns:
        RMS 값 (0=무음, ~500=조용한 발화, ~2000=보통 발화, ~8000=매우 큰 소리)
    """
    if len(audio) < 2:
        return 0.0
    import struct
    n = len(audio) // 2
    samples = struct.unpack(f"<{n}h", audio[:n * 2])
    total = sum(s * s for s in samples)
    return (total / n) ** 0.5


def ulaw_rms(audio: bytes) -> float:
    """g711 mu-law 오디오의 RMS 에너지를 계산한다.

    Returns:
        RMS 값 (0=무음, ~500=조용한 발화, ~2000=보통 발화, ~8000=매우 큰 소리)
    """
    if not audio:
        return 0.0
    total = sum(_ULAW_TO_LINEAR[b] ** 2 for b in audio)
    return (total / len(audio)) ** 0.5
