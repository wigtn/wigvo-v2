// =============================================================================
// 시나리오별 프롬프트 인덱스
// =============================================================================

import type { ScenarioType, ScenarioSubType } from '@/shared/types';

// 예약 시나리오 프롬프트
import {
  RESTAURANT_SYSTEM_PROMPT,
  RESTAURANT_FEW_SHOT_EXAMPLES,
} from './reservation-restaurant';
import {
  SALON_SYSTEM_PROMPT,
  SALON_FEW_SHOT_EXAMPLES,
} from './reservation-salon';
import {
  HOTEL_SYSTEM_PROMPT,
  HOTEL_FEW_SHOT_EXAMPLES,
} from './reservation-hotel';

// 문의 시나리오 프롬프트
import {
  PROPERTY_SYSTEM_PROMPT,
  PROPERTY_FEW_SHOT_EXAMPLES,
} from './inquiry-property';
import {
  AVAILABILITY_SYSTEM_PROMPT,
  AVAILABILITY_FEW_SHOT_EXAMPLES,
} from './inquiry-availability';

// AS 시나리오 프롬프트
import {
  HOME_APPLIANCE_SYSTEM_PROMPT,
  HOME_APPLIANCE_FEW_SHOT_EXAMPLES,
} from './as-home-appliance';

// -----------------------------------------------------------------------------
// 기본 프롬프트 (서브타입이 지정되지 않은 경우)
// -----------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `당신은 사용자를 대신해 전화를 걸어주는 친절한 AI 비서입니다.
사용자로부터 필요한 정보를 자연스럽게 수집하세요.

## 역할
- 전화에 필요한 정보를 대화로 수집합니다
- 친근하고 자연스러운 말투를 사용합니다 (해요체)
- 한 번에 하나의 정보만 물어봅니다

## 필수 수집 정보
1. **target_name**: 전화할 곳 이름
2. **target_phone**: 전화번호
3. 시나리오에 따른 추가 정보

## 대화 규칙
- 이미 수집된 정보는 다시 물어보지 않습니다
- 사용자가 한 번에 여러 정보를 주면 모두 수집합니다
- 모호한 정보는 확인 질문을 합니다`;

const DEFAULT_FEW_SHOT_EXAMPLES: { role: 'user' | 'assistant'; content: string }[] = [];

// -----------------------------------------------------------------------------
// 프롬프트 매핑
// -----------------------------------------------------------------------------
interface PromptSet {
  systemPrompt: string;
  fewShotExamples: { role: 'user' | 'assistant'; content: string }[];
}

const PROMPT_MAP: Record<string, PromptSet> = {
  // 예약 시나리오
  'RESERVATION:RESTAURANT': {
    systemPrompt: RESTAURANT_SYSTEM_PROMPT,
    fewShotExamples: RESTAURANT_FEW_SHOT_EXAMPLES,
  },
  'RESERVATION:SALON': {
    systemPrompt: SALON_SYSTEM_PROMPT,
    fewShotExamples: SALON_FEW_SHOT_EXAMPLES,
  },
  'RESERVATION:HOSPITAL': {
    systemPrompt: RESTAURANT_SYSTEM_PROMPT.replace(/식당/g, '병원').replace(/예약 인원수/g, '증상/목적'),
    fewShotExamples: [],
  },
  'RESERVATION:HOTEL': {
    systemPrompt: HOTEL_SYSTEM_PROMPT,
    fewShotExamples: HOTEL_FEW_SHOT_EXAMPLES,
  },
  'RESERVATION:OTHER': {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  },

  // 문의 시나리오
  'INQUIRY:PROPERTY': {
    systemPrompt: PROPERTY_SYSTEM_PROMPT,
    fewShotExamples: PROPERTY_FEW_SHOT_EXAMPLES,
  },
  'INQUIRY:BUSINESS_HOURS': {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  },
  'INQUIRY:AVAILABILITY': {
    systemPrompt: AVAILABILITY_SYSTEM_PROMPT,
    fewShotExamples: AVAILABILITY_FEW_SHOT_EXAMPLES,
  },
  'INQUIRY:OTHER': {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  },

  // AS 시나리오
  'AS_REQUEST:HOME_APPLIANCE': {
    systemPrompt: HOME_APPLIANCE_SYSTEM_PROMPT,
    fewShotExamples: HOME_APPLIANCE_FEW_SHOT_EXAMPLES,
  },
  'AS_REQUEST:ELECTRONICS': {
    systemPrompt: HOME_APPLIANCE_SYSTEM_PROMPT.replace(/가전제품/g, '전자기기'),
    fewShotExamples: [],
  },
  'AS_REQUEST:REPAIR': {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  },
  'AS_REQUEST:OTHER': {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  },
};

// -----------------------------------------------------------------------------
// 프롬프트 조회 함수
// -----------------------------------------------------------------------------

/**
 * 시나리오 타입과 서브타입에 맞는 시스템 프롬프트 반환
 */
export function getScenarioSystemPrompt(
  scenarioType: ScenarioType,
  subType: ScenarioSubType
): string {
  const key = `${scenarioType}:${subType}`;
  return PROMPT_MAP[key]?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
}

/**
 * 시나리오 타입과 서브타입에 맞는 Few-shot 예시 반환
 */
export function getScenarioFewShotExamples(
  scenarioType: ScenarioType,
  subType: ScenarioSubType
): { role: 'user' | 'assistant'; content: string }[] {
  const key = `${scenarioType}:${subType}`;
  return PROMPT_MAP[key]?.fewShotExamples || DEFAULT_FEW_SHOT_EXAMPLES;
}

/**
 * 시나리오 타입과 서브타입에 맞는 전체 프롬프트 세트 반환
 */
export function getScenarioPromptSet(
  scenarioType: ScenarioType,
  subType: ScenarioSubType
): PromptSet {
  const key = `${scenarioType}:${subType}`;
  return PROMPT_MAP[key] || {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fewShotExamples: DEFAULT_FEW_SHOT_EXAMPLES,
  };
}

// Re-export individual prompts for direct access
export {
  RESTAURANT_SYSTEM_PROMPT,
  RESTAURANT_FEW_SHOT_EXAMPLES,
  SALON_SYSTEM_PROMPT,
  SALON_FEW_SHOT_EXAMPLES,
  HOTEL_SYSTEM_PROMPT,
  HOTEL_FEW_SHOT_EXAMPLES,
  PROPERTY_SYSTEM_PROMPT,
  PROPERTY_FEW_SHOT_EXAMPLES,
  AVAILABILITY_SYSTEM_PROMPT,
  AVAILABILITY_FEW_SHOT_EXAMPLES,
  HOME_APPLIANCE_SYSTEM_PROMPT,
  HOME_APPLIANCE_FEW_SHOT_EXAMPLES,
  DEFAULT_SYSTEM_PROMPT,
};
