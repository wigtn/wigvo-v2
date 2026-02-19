"""토큰 비용 추정 시뮬레이션. 서버 불필요 — 모듈 직접 import."""

from src.types import CostTokens
from tests.helpers import ok, info, header


async def run() -> bool:
    header("Cost Token 추적 시뮬레이션")

    # 5분 통화 시뮬레이션 (약 30 response.done 이벤트)
    total = CostTokens()
    for i in range(30):
        response_tokens = CostTokens(
            audio_input=80 + (i % 20),
            audio_output=30 + (i % 15),
            text_input=20 + (i % 10),
            text_output=10 + (i % 5),
        )
        total.add(response_tokens)

    ok("30 응답 누적 토큰:")
    info(f"  audio_input:  {total.audio_input:,}")
    info(f"  audio_output: {total.audio_output:,}")
    info(f"  text_input:   {total.text_input:,}")
    info(f"  text_output:  {total.text_output:,}")
    info(f"  total:        {total.total:,}")

    # 비용 추정 (PRD 7.4 기준)
    # Audio: $100/1M input, $200/1M output
    # Text: $5/1M input, $20/1M output
    audio_cost = (total.audio_input * 100 + total.audio_output * 200) / 1_000_000
    text_cost = (total.text_input * 5 + total.text_output * 20) / 1_000_000
    ok(f"예상 비용: ${audio_cost + text_cost:.4f} (audio=${audio_cost:.4f}, text=${text_cost:.4f})")

    return True
