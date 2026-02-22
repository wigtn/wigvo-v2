// =============================================================================
// WIGVO LLM Response Parser (v5 - JSON Mode)
// =============================================================================
// BE1 소유 - GPT 응답에서 메시지와 JSON 데이터 분리
// v5 개선: JSON Mode 대응 (전체 응답이 JSON), fallback으로 ```json 블록 파싱 보존
// =============================================================================

import { CollectedData, DetectedIntent } from '@/shared/types';

/**
 * 파싱된 LLM 응답
 * - collected의 각 필드가 undefined면 "LLM이 언급하지 않음" → 기존 값 유지
 * - collected의 각 필드가 null이면 "LLM이 명시적으로 null 반환" → 그래도 기존 값 유지 (v3)
 * - collected의 각 필드가 값이면 "새로 수집됨" → 업데이트
 */
export interface ParsedLLMResponse {
  message: string;
  collected: Partial<CollectedData>;
  is_complete: boolean;
  next_question?: string;
  detected_intent?: DetectedIntent;
}

/**
 * collected 객체에서 null이 아닌 값만 추출 (null → undefined 변환으로 기존 값 보존)
 */
function filterCollected(rawCollected: Record<string, unknown>): Partial<CollectedData> {
  const collected: Partial<CollectedData> = {};

  const stringFields = [
    'target_name', 'target_phone', 'scenario_type', 'scenario_sub_type',
    'primary_datetime', 'service', 'fallback_action', 'customer_name', 'special_request',
  ] as const;

  for (const field of stringFields) {
    const value = rawCollected[field];
    if (value !== null && value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (collected as any)[field] = value;
    }
  }

  if (rawCollected.party_size !== null && rawCollected.party_size !== undefined) {
    collected.party_size = rawCollected.party_size as number;
  }

  if (
    rawCollected.fallback_datetimes &&
    Array.isArray(rawCollected.fallback_datetimes) &&
    rawCollected.fallback_datetimes.length > 0
  ) {
    collected.fallback_datetimes = rawCollected.fallback_datetimes;
  }

  return collected;
}

/**
 * 파싱된 JSON 객체에서 ParsedLLMResponse 추출
 */
function extractFromParsed(parsed: Record<string, unknown>): ParsedLLMResponse {
  const rawCollected = (parsed.collected || {}) as Record<string, unknown>;
  const collected = filterCollected(rawCollected);

  // detected_intent 추출
  let detected_intent: DetectedIntent | undefined;
  if (parsed.detected_intent && typeof parsed.detected_intent === 'object') {
    const di = parsed.detected_intent as Record<string, unknown>;
    if (di.scenario_type && di.scenario_sub_type && typeof di.confidence === 'number') {
      detected_intent = {
        scenario_type: di.scenario_type as DetectedIntent['scenario_type'],
        scenario_sub_type: di.scenario_sub_type as DetectedIntent['scenario_sub_type'],
        confidence: di.confidence,
      };
    }
  }

  return {
    message: (parsed.message as string) || '알겠습니다!',
    collected,
    is_complete: (parsed.is_complete as boolean) ?? false,
    next_question: parsed.next_question as string | undefined,
    detected_intent,
  };
}

/**
 * 기존 ```json 블록 파싱 (fallback safety net)
 */
function fallbackParse(content: string): ParsedLLMResponse {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = content.match(jsonBlockRegex);

  if (!match) {
    return {
      message: content.trim(),
      collected: {},
      is_complete: false,
    };
  }

  try {
    const parsed = JSON.parse(match[1]);
    const message = content.replace(jsonBlockRegex, '').trim();
    const rawCollected = (parsed.collected || {}) as Record<string, unknown>;

    return {
      message: message || '알겠습니다!',
      collected: filterCollected(rawCollected),
      is_complete: parsed.is_complete ?? false,
      next_question: parsed.next_question,
    };
  } catch {
    const message = content.replace(jsonBlockRegex, '').trim();
    return {
      message: message || content.trim(),
      collected: {},
      is_complete: false,
    };
  }
}

/**
 * GPT 응답에서 메시지와 JSON 데이터를 분리
 *
 * v5: JSON Mode 대응
 * - 1차: 전체 응답을 JSON.parse (JSON mode 응답)
 * - 2차: ```json 블록 추출 (fallback, 기존 호환)
 */
export function parseAssistantResponse(content: string): ParsedLLMResponse {
  // 1차: 전체 JSON 파싱 (JSON mode)
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      // JSON mode 응답: message 필드가 있으면 유효한 구조
      if (parsed.message !== undefined || parsed.collected !== undefined) {
        return extractFromParsed(parsed);
      }
    } catch {
      // JSON 파싱 실패 → fallback으로 진행
    }
  }

  // 2차: 기존 ```json 블록 추출 (fallback safety net)
  return fallbackParse(content);
}
