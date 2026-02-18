// =============================================================================
// WIGVO Scenario Configuration (v3)
// =============================================================================
// 시나리오별 설정을 중앙 관리
// =============================================================================

import type {
  ScenarioType,
  ScenarioSubType,
  ReservationSubType,
  InquirySubType,
  AsRequestSubType,
  CollectedData,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';

// -----------------------------------------------------------------------------
// 서브타입별 필수 필드 정의
// -----------------------------------------------------------------------------
export interface SubTypeConfig {
  label: string;
  requiredFields: (keyof CollectedData)[];
  optionalFields: (keyof CollectedData)[];
  description: string;
}

export interface ScenarioConfig {
  label: string;
  icon: string;
  description: string;
  subTypes: Record<string, SubTypeConfig>;
}

// -----------------------------------------------------------------------------
// 시나리오 설정
// -----------------------------------------------------------------------------
export const SCENARIO_CONFIG: Record<ScenarioType, ScenarioConfig> = {
  RESERVATION: {
    label: '예약하기',
    icon: 'calendar',
    description: '식당, 미용실, 병원 등 예약이 필요한 곳에 전화합니다.',
    subTypes: {
      RESTAURANT: {
        label: '식당',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime', 'party_size', 'customer_name'],
        optionalFields: ['special_request', 'fallback_datetimes', 'fallback_action'],
        description: '식당 예약을 대신 해드립니다.',
      },
      SALON: {
        label: '미용실',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime', 'service', 'customer_name'],
        optionalFields: ['special_request', 'fallback_datetimes', 'fallback_action'],
        description: '미용실 예약을 대신 해드립니다.',
      },
      HOSPITAL: {
        label: '병원/치과',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime', 'customer_name'],
        optionalFields: ['special_request', 'service', 'fallback_datetimes', 'fallback_action'],
        description: '병원/치과 예약을 대신 해드립니다.',
      },
      HOTEL: {
        label: '호텔/숙소',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime', 'party_size', 'customer_name'],
        optionalFields: ['special_request', 'fallback_datetimes', 'fallback_action'],
        description: '호텔/숙소 예약을 대신 해드립니다.',
      },
      OTHER: {
        label: '기타 예약',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime', 'customer_name'],
        optionalFields: ['special_request', 'party_size', 'service', 'fallback_datetimes', 'fallback_action'],
        description: '기타 예약을 대신 해드립니다.',
      },
    },
  },
  INQUIRY: {
    label: '문의하기',
    icon: 'search',
    description: '매물 확인, 영업시간, 재고 등을 문의합니다.',
    subTypes: {
      PROPERTY: {
        label: '매물 확인',
        requiredFields: ['target_name', 'target_phone', 'special_request'],
        optionalFields: ['customer_name', 'primary_datetime'],
        description: '부동산 매물 정보를 확인해드립니다.',
      },
      BUSINESS_HOURS: {
        label: '영업시간/가격',
        requiredFields: ['target_name', 'target_phone'],
        optionalFields: ['service', 'special_request'],
        description: '영업시간이나 가격을 확인해드립니다.',
      },
      AVAILABILITY: {
        label: '재고/가능 여부',
        requiredFields: ['target_name', 'target_phone', 'service'],
        optionalFields: ['special_request'],
        description: '재고나 서비스 가능 여부를 확인해드립니다.',
      },
      OTHER: {
        label: '기타 문의',
        requiredFields: ['target_name', 'target_phone'],
        optionalFields: ['service', 'special_request', 'customer_name'],
        description: '기타 문의를 대신 해드립니다.',
      },
    },
  },
  AS_REQUEST: {
    label: 'AS/수리',
    icon: 'wrench',
    description: '가전제품, 전자기기 AS 및 수리를 접수합니다.',
    subTypes: {
      HOME_APPLIANCE: {
        label: '가전제품',
        requiredFields: ['target_name', 'target_phone', 'service', 'special_request'],
        optionalFields: ['customer_name', 'primary_datetime'],
        description: '가전제품 AS를 접수해드립니다.',
      },
      ELECTRONICS: {
        label: '전자기기',
        requiredFields: ['target_name', 'target_phone', 'service', 'special_request'],
        optionalFields: ['customer_name', 'primary_datetime'],
        description: '전자기기 AS를 접수해드립니다.',
      },
      REPAIR: {
        label: '수리/설치',
        requiredFields: ['target_name', 'target_phone', 'primary_datetime'],
        optionalFields: ['service', 'special_request', 'customer_name'],
        description: '수리/설치 예약을 대신 해드립니다.',
      },
      OTHER: {
        label: '기타 AS',
        requiredFields: ['target_name', 'target_phone'],
        optionalFields: ['service', 'special_request', 'customer_name', 'primary_datetime'],
        description: '기타 AS를 접수해드립니다.',
      },
    },
  },
};

// -----------------------------------------------------------------------------
// 헬퍼 함수
// -----------------------------------------------------------------------------

/**
 * 시나리오 타입에 대한 설정 가져오기
 */
export function getScenarioConfig(scenarioType: ScenarioType): ScenarioConfig {
  return SCENARIO_CONFIG[scenarioType];
}

/**
 * 서브타입에 대한 설정 가져오기
 */
export function getSubTypeConfig(
  scenarioType: ScenarioType,
  subType: ScenarioSubType
): SubTypeConfig | null {
  const scenario = SCENARIO_CONFIG[scenarioType];
  if (!scenario) return null;
  return scenario.subTypes[subType] || null;
}

/**
 * 모드별 필수 필드 반환
 * - full_agent: 시나리오별 전체 필수 필드 (기존 동작)
 * - relay 모드 (voice_to_voice, text_to_voice, voice_to_text): target_name + target_phone만 필수
 */
export function getRequiredFieldsForMode(
  scenarioType: ScenarioType,
  subType: ScenarioSubType,
  communicationMode?: CommunicationMode
): (keyof CollectedData)[] {
  if (communicationMode && communicationMode !== 'full_agent') {
    // relay 모드: 최소 필드만 필요
    return ['target_name', 'target_phone'];
  }
  // full_agent 또는 모드 미지정: 기존 시나리오별 필수 필드
  const config = getSubTypeConfig(scenarioType, subType);
  return config ? config.requiredFields : ['target_name', 'target_phone'];
}

/**
 * 필수 필드가 모두 수집되었는지 확인
 */
export function isCollectionComplete(
  scenarioType: ScenarioType,
  subType: ScenarioSubType,
  collected: CollectedData,
  communicationMode?: CommunicationMode
): boolean {
  const requiredFields = getRequiredFieldsForMode(scenarioType, subType, communicationMode);

  return requiredFields.every((field) => {
    const value = collected[field];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== undefined && value !== '';
  });
}

/**
 * 다음에 수집해야 할 필드 반환
 */
export function getNextRequiredField(
  scenarioType: ScenarioType,
  subType: ScenarioSubType,
  collected: CollectedData,
  communicationMode?: CommunicationMode
): keyof CollectedData | null {
  const requiredFields = getRequiredFieldsForMode(scenarioType, subType, communicationMode);

  for (const field of requiredFields) {
    const value = collected[field];
    if (value === null || value === undefined || value === '') {
      return field;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
  }

  return null;
}

/**
 * 필드에 대한 한국어 레이블 반환
 */
export function getFieldLabel(field: keyof CollectedData): string {
  const labels: Record<keyof CollectedData, string> = {
    target_name: '장소 이름',
    target_phone: '전화번호',
    scenario_type: '시나리오 유형',
    scenario_sub_type: '세부 유형',
    primary_datetime: '희망 일시',
    service: '서비스/시술',
    fallback_datetimes: '대안 일시',
    fallback_action: '대안 행동',
    customer_name: '예약자 이름',
    party_size: '인원수',
    special_request: '특별 요청',
  };
  return labels[field] || field;
}

/**
 * 시나리오 선택 옵션 생성 (프론트엔드용)
 */
export function getScenarioOptions() {
  return Object.entries(SCENARIO_CONFIG).map(([type, config]) => ({
    type: type as ScenarioType,
    label: config.label,
    icon: config.icon,
    description: config.description,
    subTypes: Object.entries(config.subTypes).map(([subType, subConfig]) => ({
      type: subType as ScenarioSubType,
      label: subConfig.label,
      description: subConfig.description,
    })),
  }));
}

/**
 * 시나리오별 초기 인사 메시지 생성 (모드별 분기)
 */
export function getScenarioGreeting(
  scenarioType: ScenarioType,
  subType: ScenarioSubType,
  communicationMode?: CommunicationMode
): string {
  const config = getSubTypeConfig(scenarioType, subType);
  if (!config) {
    return '안녕하세요! 어떤 전화를 대신 걸어드릴까요?';
  }

  // relay 모드: 간결한 인사 (전화할 곳 + 번호만 수집)
  if (communicationMode && communicationMode !== 'full_agent') {
    const modeLabels: Record<string, string> = {
      voice_to_voice: '양방향 음성 번역',
      text_to_voice: '텍스트→음성',
      voice_to_text: '음성→자막',
    };
    const modeLabel = modeLabels[communicationMode] || communicationMode;
    return `${modeLabel} 모드로 전화를 걸어드릴게요! 어디에 전화하시겠어요? (장소 이름과 전화번호만 알려주세요)`;
  }

  // full_agent: 기존 상세 인사
  const greetings: Record<ScenarioType, Record<string, string>> = {
    RESERVATION: {
      RESTAURANT: '식당 예약을 도와드릴게요! 어느 식당에 예약하시겠어요?',
      SALON: '미용실 예약을 도와드릴게요! 어느 미용실에 예약하시겠어요?',
      HOSPITAL: '병원 예약을 도와드릴게요! 어느 병원에 예약하시겠어요?',
      HOTEL: '숙소 예약을 도와드릴게요! 어느 숙소에 예약하시겠어요?',
      OTHER: '예약을 도와드릴게요! 어디에 예약하시겠어요?',
    },
    INQUIRY: {
      PROPERTY: '매물 확인을 도와드릴게요! 어느 매물에 대해 문의하시겠어요?',
      BUSINESS_HOURS: '영업시간/가격 확인을 도와드릴게요! 어디에 문의하시겠어요?',
      AVAILABILITY: '재고/가능 여부 확인을 도와드릴게요! 어디에 문의하시겠어요?',
      OTHER: '문의를 도와드릴게요! 어디에 문의하시겠어요?',
    },
    AS_REQUEST: {
      HOME_APPLIANCE: '가전제품 AS 접수를 도와드릴게요! 어떤 제품의 AS를 원하시나요?',
      ELECTRONICS: '전자기기 AS 접수를 도와드릴게요! 어떤 제품의 AS를 원하시나요?',
      REPAIR: '수리/설치 예약을 도와드릴게요! 어떤 수리/설치가 필요하신가요?',
      OTHER: 'AS 접수를 도와드릴게요! 어떤 AS가 필요하신가요?',
    },
  };

  return greetings[scenarioType]?.[subType] || config.description;
}
