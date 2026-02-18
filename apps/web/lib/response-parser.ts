// =============================================================================
// WIGVO LLM Response Parser (v3)
// =============================================================================
// BE1 소유 - GPT 응답에서 메시지와 JSON 데이터 분리
// v3 개선: undefined 보존으로 기존 값 유지 (null과 undefined 구분)
// =============================================================================

import { CollectedData } from '@/shared/types';

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
}

/**
 * GPT 응답에서 메시지와 JSON 데이터를 분리
 * 
 * v3 개선사항:
 * - LLM이 JSON에서 필드를 생략하거나 null로 보내면 undefined로 처리
 * - 실제 값이 있을 때만 해당 필드를 포함
 * - 이렇게 하면 mergeCollectedData에서 기존 값이 보존됨
 *
 * @param content - GPT 응답 전체 텍스트
 * @returns 파싱된 응답 (실패 시 fallback 반환)
 */
export function parseAssistantResponse(content: string): ParsedLLMResponse {
  // JSON 블록 추출 정규식: ```json ... ```
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = content.match(jsonBlockRegex);

  if (!match) {
    // JSON 블록이 없으면 전체를 메시지로 반환
    return {
      message: content.trim(),
      collected: {}, // 빈 객체 = 아무것도 수집 안 됨 = 기존 값 유지
      is_complete: false,
    };
  }

  try {
    const jsonStr = match[1];
    const parsed = JSON.parse(jsonStr);

    // JSON 블록 제거한 나머지를 메시지로
    const message = content.replace(jsonBlockRegex, '').trim();

    // collected 객체 추출 - null이 아닌 값만 포함 (핵심 변경!)
    // LLM이 null을 보내면 "모름/수집 안 됨"으로 해석 → undefined로 처리하여 기존 값 유지
    const rawCollected = parsed.collected || {};
    const collected: Partial<CollectedData> = {};
    
    // 각 필드를 검사하여 실제 값이 있을 때만 포함
    if (rawCollected.target_name !== null && rawCollected.target_name !== undefined) {
      collected.target_name = rawCollected.target_name;
    }
    if (rawCollected.target_phone !== null && rawCollected.target_phone !== undefined) {
      collected.target_phone = rawCollected.target_phone;
    }
    if (rawCollected.scenario_type !== null && rawCollected.scenario_type !== undefined) {
      collected.scenario_type = rawCollected.scenario_type;
    }
    // v4: scenario_sub_type 추가
    if (rawCollected.scenario_sub_type !== null && rawCollected.scenario_sub_type !== undefined) {
      collected.scenario_sub_type = rawCollected.scenario_sub_type;
    }
    if (rawCollected.primary_datetime !== null && rawCollected.primary_datetime !== undefined) {
      collected.primary_datetime = rawCollected.primary_datetime;
    }
    if (rawCollected.service !== null && rawCollected.service !== undefined) {
      collected.service = rawCollected.service;
    }
    if (rawCollected.fallback_datetimes && Array.isArray(rawCollected.fallback_datetimes) && rawCollected.fallback_datetimes.length > 0) {
      collected.fallback_datetimes = rawCollected.fallback_datetimes;
    }
    if (rawCollected.fallback_action !== null && rawCollected.fallback_action !== undefined) {
      collected.fallback_action = rawCollected.fallback_action;
    }
    if (rawCollected.customer_name !== null && rawCollected.customer_name !== undefined) {
      collected.customer_name = rawCollected.customer_name;
    }
    if (rawCollected.party_size !== null && rawCollected.party_size !== undefined) {
      collected.party_size = rawCollected.party_size;
    }
    if (rawCollected.special_request !== null && rawCollected.special_request !== undefined) {
      collected.special_request = rawCollected.special_request;
    }

    return {
      message: message || '알겠습니다!',
      collected,
      is_complete: parsed.is_complete ?? false,
      next_question: parsed.next_question,
    };
  } catch {
    // JSON 파싱 실패 시 fallback
    // JSON 블록 제거 시도
    const message = content.replace(jsonBlockRegex, '').trim();

    return {
      message: message || content.trim(),
      collected: {}, // 빈 객체 = 기존 값 유지
      is_complete: false,
    };
  }
}
