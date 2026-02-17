"""v3 System Prompt 생성기 — Relay/Agent 모드별, 양방향 언어.

PRD 8.1 기반. 수집된 데이터와 언어 설정으로 동적 프롬프트를 생성한다.
"""

import json
import logging
from typing import Any

from src.prompt.templates import (
    CULTURAL_ADAPTATION_RULES,
    POLITENESS_RULES,
    SESSION_A_AGENT_TEMPLATE,
    SESSION_A_RELAY_TEMPLATE,
    SESSION_B_TEMPLATE,
    TERM_EXPLANATION_RULES,
)
from src.types import CallMode

logger = logging.getLogger(__name__)


def generate_session_a_prompt(
    mode: CallMode,
    source_language: str,
    target_language: str,
    collected_data: dict[str, Any] | None = None,
) -> str:
    """Session A (User→수신자) 프롬프트를 생성한다."""
    lang_pair = (source_language, target_language)

    if mode == CallMode.RELAY:
        prompt = SESSION_A_RELAY_TEMPLATE.format(
            source_language=_lang_name(source_language),
            target_language=_lang_name(target_language),
            politeness_rules=POLITENESS_RULES.get(lang_pair, "Use polite speech."),
            cultural_adaptation_rules=CULTURAL_ADAPTATION_RULES.get(
                lang_pair, "Adapt naturally."
            ),
            target_name=_get(collected_data, "target_name", "the recipient"),
            scenario_type=_get(collected_data, "scenario_type", "general inquiry"),
            service=_get(collected_data, "service", ""),
            customer_name=_get(collected_data, "customer_name", "the customer"),
        )
    else:
        prompt = SESSION_A_AGENT_TEMPLATE.format(
            target_language=_lang_name(target_language),
            collected_data=json.dumps(collected_data or {}, ensure_ascii=False, indent=2),
            scenario_type=_get(collected_data, "scenario_type", "general inquiry"),
            service=_get(collected_data, "service", ""),
            target_name=_get(collected_data, "target_name", "the recipient"),
            target_phone=_get(collected_data, "target_phone", ""),
        )

    logger.info(
        "Generated Session A prompt (mode=%s, %s→%s, %d chars)",
        mode.value,
        source_language,
        target_language,
        len(prompt),
    )
    return prompt


def generate_session_b_prompt(
    source_language: str,
    target_language: str,
) -> str:
    """Session B (수신자→User) 프롬프트를 생성한다."""
    lang_pair = (target_language, source_language)

    prompt = SESSION_B_TEMPLATE.format(
        source_language=_lang_name(source_language),
        target_language=_lang_name(target_language),
        term_explanation_rules=TERM_EXPLANATION_RULES.get(
            lang_pair, "Add brief context for culture-specific terms."
        ),
    )

    logger.info(
        "Generated Session B prompt (%s→%s, %d chars)",
        target_language,
        source_language,
        len(prompt),
    )
    return prompt


def _lang_name(code: str) -> str:
    names = {"en": "English", "ko": "Korean", "ja": "Japanese", "zh": "Chinese"}
    return names.get(code, code)


def _get(data: dict | None, key: str, default: str = "") -> str:
    if data and key in data:
        return str(data[key])
    return default
