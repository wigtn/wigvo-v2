import type { Language } from '../types.js';
import { config } from '../config.js';
import { filterText } from './filter.js';
import { correctWithFallbackLLM } from './fallback-llm.js';

/**
 * Guardrail Level Classification:
 *
 * Level 1 (Auto-pass): Simple, safe translations. No additional processing.
 * Level 2 (Async correction): Minor informal patterns detected.
 *   → TTS output immediately, correction runs in background for logging.
 * Level 3 (Sync blocking): Banned words or serious issues detected.
 *   → Block TTS, play filler audio, correct with LLM, then output.
 */
export type GuardrailLevel = 1 | 2 | 3;

export interface GuardrailResult {
  level: GuardrailLevel;
  passed: boolean;
  originalText: string;
  correctedText?: string;
  issues: string[];
  latencyMs: number;
}

export interface GuardrailEvent {
  timestamp: number;
  level: GuardrailLevel;
  originalText: string;
  correctedText?: string;
  issues: string[];
  latencyMs: number;
  action: 'pass' | 'async_correct' | 'sync_block' | 'fallback_failed';
}

const FILLER_PHRASES: Record<Language, string[]> = {
  ko: ['잠시만요...', '확인 중입니다...', '한 번 더 확인하겠습니다...'],
  en: ['One moment please...', 'Let me check...', 'Just a moment...'],
};

export function getFillerPhrase(language: Language): string {
  const phrases = FILLER_PHRASES[language];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Main guardrail checker.
 * Classifies text into levels and applies corrections as needed.
 */
export async function checkGuardrail(
  text: string,
  targetLanguage: Language,
): Promise<GuardrailResult> {
  const startTime = Date.now();

  // If guardrail is disabled, auto-pass everything
  if (!config.guardrailEnabled) {
    return {
      level: 1,
      passed: true,
      originalText: text,
      issues: [],
      latencyMs: 0,
    };
  }

  // Run rule-based filter
  const filterResult = filterText(text, targetLanguage);

  // Level 1: No issues — auto-pass
  if (filterResult.issues.length === 0) {
    return {
      level: 1,
      passed: true,
      originalText: text,
      issues: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // Level 3: High severity (banned words) — sync block + LLM correction
  const hasHighSeverity = filterResult.issues.some((i) => i.severity === 'high');
  if (hasHighSeverity) {
    const issueDesc = filterResult.issues.map((i) => i.description).join('; ');
    const correction = await correctWithFallbackLLM(text, targetLanguage, issueDesc);

    return {
      level: 3,
      passed: correction !== null,
      originalText: text,
      correctedText: correction?.corrected,
      issues: filterResult.issues.map((i) => i.description),
      latencyMs: Date.now() - startTime,
    };
  }

  // Level 2: Medium/low severity — async correction (pass through, log correction)
  return {
    level: 2,
    passed: true,
    originalText: text,
    correctedText: filterResult.corrected,
    issues: filterResult.issues.map((i) => i.description),
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Create a guardrail event log entry.
 */
export function createGuardrailEvent(result: GuardrailResult): GuardrailEvent {
  let action: GuardrailEvent['action'];
  if (result.level === 1) {
    action = 'pass';
  } else if (result.level === 2) {
    action = 'async_correct';
  } else if (result.passed) {
    action = 'sync_block';
  } else {
    action = 'fallback_failed';
  }

  return {
    timestamp: Date.now(),
    level: result.level,
    originalText: result.originalText,
    correctedText: result.correctedText,
    issues: result.issues,
    latencyMs: result.latencyMs,
    action,
  };
}
