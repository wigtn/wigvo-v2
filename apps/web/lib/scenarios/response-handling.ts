// =============================================================================
// 상대방 응답 대응 가이드 (v3)
// =============================================================================
// 전화 통화 중 상대방의 다양한 응답에 대한 대응 방법 정의
// =============================================================================

import type { ScenarioSubType } from '@/shared/types';

// -----------------------------------------------------------------------------
// 응답 핸들러 타입 정의
// -----------------------------------------------------------------------------
export interface ResponseHandler {
  triggers: string[];           // 상대방이 이런 말을 하면
  response: string;             // 이렇게 대응
  action: ResponseAction;       // 시스템 액션
  priority: number;             // 우선순위 (높을수록 먼저 매칭)
}

export type ResponseAction =
  | 'WAIT_SILENTLY'      // 조용히 기다리기
  | 'REPEAT_SLOWLY'      // 천천히 다시 말하기
  | 'PROVIDE_INFO'       // 정보 제공하기
  | 'ASK_ALTERNATIVE'    // 대안 물어보기
  | 'CONFIRM_DETAILS'    // 세부사항 확인하기
  | 'END_CALL_SUCCESS'   // 성공으로 통화 종료
  | 'END_CALL_FAILED'    // 실패로 통화 종료
  | 'REDIRECT'           // 다른 주제로 전환
  | 'ESCALATE';          // 사람에게 연결 요청

// -----------------------------------------------------------------------------
// 공통 응답 핸들러 (모든 시나리오에서 사용)
// -----------------------------------------------------------------------------
export const COMMON_RESPONSES: ResponseHandler[] = [
  // 대기 요청
  {
    triggers: ['잠시만요', '잠깐만요', '기다려주세요', '잠시만 기다려주세요', '확인해볼게요'],
    response: '네, 기다리겠습니다.',
    action: 'WAIT_SILENTLY',
    priority: 100,
  },
  
  // 다시 말해달라는 요청
  {
    triggers: ['뭐라고요?', '다시 말씀해주세요', '못 들었어요', '뭐라고 하셨어요?', '다시요?'],
    response: '죄송해요, 천천히 다시 말씀드릴게요.',
    action: 'REPEAT_SLOWLY',
    priority: 95,
  },
  
  // 연락처 요청
  {
    triggers: ['연락처가 어떻게 되세요?', '전화번호 알려주세요', '연락 가능한 번호요?', '콜백 번호요?'],
    response: '예약자 연락처는 {customer_phone}입니다.',
    action: 'PROVIDE_INFO',
    priority: 90,
  },
  
  // 이름 요청
  {
    triggers: ['성함이 어떻게 되세요?', '이름이요?', '예약자 성함요?', '누구 앞으로요?'],
    response: '예약자 이름은 {customer_name}입니다.',
    action: 'PROVIDE_INFO',
    priority: 90,
  },
  
  // 확인 완료
  {
    triggers: ['네 알겠습니다', '예약 완료됐습니다', '접수됐습니다', '확인됐습니다'],
    response: '감사합니다. 좋은 하루 되세요.',
    action: 'END_CALL_SUCCESS',
    priority: 85,
  },
  
  // 거절/불가
  {
    triggers: ['안 됩니다', '불가능합니다', '어렵습니다', '죄송합니다만'],
    response: '알겠습니다. 다른 방법이 있을까요?',
    action: 'ASK_ALTERNATIVE',
    priority: 80,
  },
  
  // 영업 종료
  {
    triggers: ['영업 끝났어요', '문 닫았어요', '마감했어요', '오늘은 안 돼요'],
    response: '아, 그렇군요. 내일은 가능할까요?',
    action: 'ASK_ALTERNATIVE',
    priority: 80,
  },
  
  // 담당자 부재
  {
    triggers: ['담당자가 없어요', '지금 자리에 없어요', '퇴근했어요', '외근 중이에요'],
    response: '언제 다시 연락드리면 될까요?',
    action: 'ASK_ALTERNATIVE',
    priority: 75,
  },
  
  // AI 의심
  {
    triggers: ['로봇이세요?', 'AI예요?', '기계예요?', '사람이세요?'],
    response: '고객님을 대신해서 전화드리고 있어요.',
    action: 'REDIRECT',
    priority: 70,
  },
  
  // 통화 종료 신호
  {
    triggers: ['그럼 이만', '끊을게요', '들어가볼게요', '바빠서요'],
    response: '네, 감사합니다. 좋은 하루 되세요.',
    action: 'END_CALL_SUCCESS',
    priority: 65,
  },
];

// -----------------------------------------------------------------------------
// 시나리오별 응답 핸들러
// -----------------------------------------------------------------------------
export const SCENARIO_RESPONSES: Record<string, ResponseHandler[]> = {
  // 식당 예약
  RESTAURANT: [
    {
      triggers: ['자리가 없어요', '예약이 꽉 찼어요', '만석이에요'],
      response: '그럼 다른 시간은 가능할까요?',
      action: 'ASK_ALTERNATIVE',
      priority: 90,
    },
    {
      triggers: ['몇 분이세요?', '인원이 어떻게 되세요?'],
      response: '{party_size}명입니다.',
      action: 'PROVIDE_INFO',
      priority: 85,
    },
    {
      triggers: ['예약금이 있어요', '노쇼 시 위약금', '선결제'],
      response: '네, 알겠습니다. 진행해주세요.',
      action: 'CONFIRM_DETAILS',
      priority: 80,
    },
    {
      triggers: ['코스만 가능해요', '단품은 안 돼요'],
      response: '네, 코스로 예약할게요. 어떤 코스가 있나요?',
      action: 'ASK_ALTERNATIVE',
      priority: 75,
    },
    {
      triggers: ['대기 가능해요', '웨이팅 하시겠어요?'],
      response: '대기 시간이 얼마나 될까요?',
      action: 'ASK_ALTERNATIVE',
      priority: 70,
    },
  ],

  // 미용실 예약
  SALON: [
    {
      triggers: ['디자이너 지정하실 건가요?', '담당 선생님 있으세요?'],
      response: '{special_request에 디자이너가 있으면 해당 이름, 없으면 "아무나 괜찮아요"}',
      action: 'PROVIDE_INFO',
      priority: 90,
    },
    {
      triggers: ['시간이 좀 걸려요', '2시간 정도 걸려요'],
      response: '네, 괜찮습니다.',
      action: 'CONFIRM_DETAILS',
      priority: 85,
    },
    {
      triggers: ['가격이요?', '비용이 얼마예요?'],
      response: '가격은 확인만 해주시고, 예약 진행해주세요.',
      action: 'REDIRECT',
      priority: 80,
    },
    {
      triggers: ['머리 길이가 어떻게 되세요?', '기장이요?'],
      response: '보통 길이예요.',
      action: 'PROVIDE_INFO',
      priority: 75,
    },
  ],

  // 매물 확인
  PROPERTY: [
    {
      triggers: ['계약됐어요', '나갔어요', '없어요'],
      response: '아, 그렇군요. 비슷한 조건의 다른 매물은 있을까요?',
      action: 'ASK_ALTERNATIVE',
      priority: 90,
    },
    {
      triggers: ['보러 오실 건가요?', '방문 가능하세요?'],
      response: '네, 언제 볼 수 있을까요?',
      action: 'ASK_ALTERNATIVE',
      priority: 85,
    },
    {
      triggers: ['가격 조정은 안 돼요', '네고 안 돼요'],
      response: '알겠습니다. 그 가격으로 진행할게요.',
      action: 'CONFIRM_DETAILS',
      priority: 80,
    },
    {
      triggers: ['어떤 매물이요?', '어디 보신 거예요?'],
      response: '{special_request} 매물이요.',
      action: 'PROVIDE_INFO',
      priority: 75,
    },
    {
      triggers: ['입주 가능일이요?', '언제부터 가능해요?'],
      response: '입주 가능일이 언제인가요?',
      action: 'ASK_ALTERNATIVE',
      priority: 70,
    },
  ],

  // 가전 AS
  HOME_APPLIANCE: [
    {
      triggers: ['모델명이 어떻게 되세요?', '제품 번호요?'],
      response: '정확한 모델명은 모르겠어요. 기사님이 오시면 확인 가능할까요?',
      action: 'REDIRECT',
      priority: 90,
    },
    {
      triggers: ['보증기간이요?', '구매일이 언제예요?'],
      response: '정확한 구매일은 모르겠어요. 확인 부탁드려요.',
      action: 'REDIRECT',
      priority: 85,
    },
    {
      triggers: ['출장비가 있어요', '방문비가 발생해요'],
      response: '네, 알겠습니다. 진행해주세요.',
      action: 'CONFIRM_DETAILS',
      priority: 80,
    },
    {
      triggers: ['언제 방문하면 될까요?', '일정이 어떻게 되세요?'],
      response: '{primary_datetime이 있으면 해당 시간, 없으면 "가능한 빠른 시간으로 부탁드려요"}',
      action: 'PROVIDE_INFO',
      priority: 75,
    },
    {
      triggers: ['주소가 어떻게 되세요?', '방문 주소요?'],
      response: '주소는 예약자분께 확인해서 문자로 보내드릴게요.',
      action: 'REDIRECT',
      priority: 70,
    },
  ],
};

// -----------------------------------------------------------------------------
// 헬퍼 함수
// -----------------------------------------------------------------------------

/**
 * 상대방 응답에 맞는 핸들러 찾기
 */
export function findResponseHandler(
  utterance: string,
  subType?: ScenarioSubType
): ResponseHandler | null {
  const normalizedUtterance = utterance.toLowerCase().trim();
  
  // 시나리오별 응답 먼저 확인
  if (subType && SCENARIO_RESPONSES[subType]) {
    for (const handler of SCENARIO_RESPONSES[subType]) {
      for (const trigger of handler.triggers) {
        if (normalizedUtterance.includes(trigger.toLowerCase())) {
          return handler;
        }
      }
    }
  }
  
  // 공통 응답 확인
  for (const handler of COMMON_RESPONSES) {
    for (const trigger of handler.triggers) {
      if (normalizedUtterance.includes(trigger.toLowerCase())) {
        return handler;
      }
    }
  }
  
  return null;
}

/**
 * 응답 핸들러를 프롬프트 섹션으로 변환
 */
export function buildResponseHandlingSection(subType?: ScenarioSubType): string {
  const handlers = [
    ...COMMON_RESPONSES,
    ...(subType && SCENARIO_RESPONSES[subType] ? SCENARIO_RESPONSES[subType] : []),
  ].sort((a, b) => b.priority - a.priority);

  const sections = handlers.slice(0, 10).map((handler) => {
    return `- 상대방: "${handler.triggers[0]}" → 나: "${handler.response}"`;
  });

  return `## 상대방 응답 대응 가이드

다음 상황에서는 이렇게 대응하세요:

${sections.join('\n')}

### 대응 원칙
1. 상대방이 기다려달라고 하면 조용히 기다립니다
2. 못 알아들으면 천천히 다시 말합니다
3. 거절당하면 대안을 물어봅니다
4. 확인이 완료되면 감사 인사 후 종료합니다
5. AI인지 물으면 "고객님을 대신해서 전화드리고 있어요"라고 답합니다`;
}

/**
 * 모든 응답 핸들러 가져오기 (디버깅/테스트용)
 */
export function getAllResponseHandlers(subType?: ScenarioSubType): ResponseHandler[] {
  return [
    ...COMMON_RESPONSES,
    ...(subType && SCENARIO_RESPONSES[subType] ? SCENARIO_RESPONSES[subType] : []),
  ].sort((a, b) => b.priority - a.priority);
}
