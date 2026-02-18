"""가드레일 레벨 1/2/3 분류 테스트. 서버 불필요 — 모듈 직접 import."""

from src.guardrail.checker import GuardrailChecker, GuardrailLevel
from scripts.tests.helpers import ok, fail, header


async def run() -> bool:
    header("Guardrail 실시간 테스트")

    gc = GuardrailChecker(target_language="ko")
    all_pass = True

    cases = [
        ("안녕하세요, 예약 확인 부탁드립니다.", GuardrailLevel.LEVEL_1, "존댓말 → PASS"),
        ("이거 알겠어요", GuardrailLevel.LEVEL_2, "반말 어미 → 비동기 교정"),
        ("씨발이다", GuardrailLevel.LEVEL_3, "욕설 → 동기 차단"),
    ]

    for text, expected_level, description in cases:
        gc.reset()
        level = gc.check_text_delta(text)
        if level == expected_level:
            ok(f"'{text}' \u2192 Level {level} ({description})")
        else:
            fail(f"'{text}' \u2192 Level {level} (기대: Level {expected_level})")
            all_pass = False

    # blocking 상태 테스트
    gc.reset()
    gc.check_text_delta("씨발이다")
    if gc.is_blocking:
        ok("Level 3 \u2192 is_blocking = True (TTS 오디오 차단)")
    else:
        fail("Level 3인데 is_blocking = False")
        all_pass = False

    return all_pass
