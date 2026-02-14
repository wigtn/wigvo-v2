"""Guardrail + Fallback LLM module (PRD Phase 4 / M-2).

Provides translation quality assurance through:
- Rule-based text filtering (informal speech, profanity)
- 3-level classification (PASS / async correction / sync block)
- Fallback LLM correction via GPT-4o-mini
"""

from src.guardrail.checker import GuardrailChecker, GuardrailLevel, GuardrailResult

__all__ = ["GuardrailChecker", "GuardrailLevel", "GuardrailResult"]
