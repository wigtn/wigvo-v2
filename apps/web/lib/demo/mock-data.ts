// =============================================================================
// Demo Mode — Mock Data (Restaurant Reservation Scenario)
// =============================================================================
// 외국인 사용자가 한국 레스토랑 예약하는 시나리오
// en → ko 양방향 번역 데모
// 지도 검색 2회 + 장소 선택 + 예약 확인 → 통화
// =============================================================================

import type {
  CollectedData,
  ChatResponse,
  CreateConversationResponse,
  Call,
} from '@/shared/types';

// --- IDs ---
export const DEMO_CONVERSATION_ID = 'demo-conv-001';
export const DEMO_CALL_ID = 'demo-call-001';
export const DEMO_USER_ID = 'demo-user-001';

// --- Base collected data ---
const BASE_COLLECTED: CollectedData = {
  target_name: null,
  target_phone: null,
  scenario_type: 'RESERVATION',
  scenario_sub_type: 'RESTAURANT',
  primary_datetime: null,
  service: null,
  fallback_datetimes: [],
  fallback_action: null,
  customer_name: null,
  party_size: null,
  special_request: null,
  source_language: 'en',
  target_language: 'ko',
};

// --- Conversation Creation Response ---
export const DEMO_CONVERSATION: CreateConversationResponse = {
  id: DEMO_CONVERSATION_ID,
  userId: DEMO_USER_ID,
  status: 'COLLECTING',
  collectedData: { ...BASE_COLLECTED },
  greeting:
    "Hi! I'll help you make a restaurant reservation in Korea. What kind of food are you in the mood for, and which area?",
  createdAt: new Date().toISOString(),
};

// =============================================================================
// Chat Step 1: 첫 검색 — 강남 맛집 3곳
// 사용자: "I want to find a good sushi place in Gangnam"
// =============================================================================
const CHAT_STEP_1: ChatResponse = {
  message:
    "I found some great sushi restaurants in Gangnam! Here are the top picks:\n\n1. **스시 오마카세 강남점** — Premium omakase, ★4.8\n2. **스시 사이토 서울** — Tokyo-style edomae sushi, ★4.7\n3. **하루 스시** — Casual but high-quality, ★4.5\n\nWould you like to book one of these, or should I search for something different?",
  collected: { ...BASE_COLLECTED },
  is_complete: false,
  conversation_status: 'COLLECTING',
  search_results: [
    {
      name: '스시 오마카세 강남점',
      address: '서울특별시 강남구 역삼동 123-45',
      roadAddress: '서울특별시 강남구 테헤란로 152',
      telephone: '02-555-1234',
      category: '일식>초밥,롤',
      mapx: 1270282700,
      mapy: 375044900,
    },
    {
      name: '스시 사이토 서울',
      address: '서울특별시 강남구 논현동 67-8',
      roadAddress: '서울특별시 강남구 학동로 234',
      telephone: '02-555-5678',
      category: '일식>초밥,롤',
      mapx: 1270380000,
      mapy: 375120000,
    },
    {
      name: '하루 스시',
      address: '서울특별시 강남구 삼성동 45-12',
      roadAddress: '서울특별시 강남구 봉은사로 108',
      telephone: '02-555-9012',
      category: '일식>초밥,롤',
      mapx: 1270560000,
      mapy: 375090000,
    },
  ],
  map_center: { lat: 37.5045, lng: 127.0283 },
};

// =============================================================================
// Chat Step 2: 재검색 — 한식으로 변경
// 사용자: "Actually, let me try Korean BBQ instead"
// =============================================================================
const CHAT_STEP_2: ChatResponse = {
  message:
    "Great choice! Here are the best Korean BBQ spots in Gangnam:\n\n1. **마포갈매기 강남점** — Famous for pork galbi, ★4.7\n2. **본가 강남본점** — Premium hanwoo beef, ★4.9\n3. **고기리 막국수 & 갈비** — Galbi + makguksu combo, ★4.6\n\nWhich one catches your eye?",
  collected: { ...BASE_COLLECTED },
  is_complete: false,
  conversation_status: 'COLLECTING',
  search_results: [
    {
      name: '마포갈매기 강남점',
      address: '서울특별시 강남구 역삼동 789-12',
      roadAddress: '서울특별시 강남구 역삼로 65',
      telephone: '02-666-1234',
      category: '한식>고기,구이',
      mapx: 1270300000,
      mapy: 375060000,
    },
    {
      name: '본가 강남본점',
      address: '서울특별시 강남구 삼성동 156-3',
      roadAddress: '서울특별시 강남구 테헤란로 412',
      telephone: '02-666-5678',
      category: '한식>고기,구이',
      mapx: 1270520000,
      mapy: 375080000,
    },
    {
      name: '고기리 막국수 & 갈비',
      address: '서울특별시 강남구 대치동 34-7',
      roadAddress: '서울특별시 강남구 선릉로 93길 12',
      telephone: '02-666-9012',
      category: '한식>고기,구이',
      mapx: 1270460000,
      mapy: 375110000,
    },
  ],
  map_center: { lat: 37.508, lng: 127.042 },
};

// =============================================================================
// Chat Step 3: 장소 선택
// 사용자: "Number 2 looks amazing!" (본가 강남본점 선택)
// =============================================================================
const CHAT_STEP_3: ChatResponse = {
  message:
    "Excellent taste! **본가 강남본점** is known for their premium hanwoo beef — one of the top Korean BBQ restaurants in Seoul.\n\n📍 Teheran-ro 412, Gangnam\n📞 02-666-5678\n\nWhen would you like to go, and how many people?",
  collected: {
    ...BASE_COLLECTED,
    target_name: '본가 강남본점',
    target_phone: '02-666-5678',
  },
  is_complete: false,
  conversation_status: 'COLLECTING',
};

// =============================================================================
// Chat Step 4: 예약 확인 카드
// 사용자: "Tomorrow at 7pm, 2 people. Name is Harrison"
// =============================================================================
const CHAT_STEP_4: ChatResponse = {
  message:
    "Perfect! Here's your reservation summary:\n\n- **Restaurant**: 본가 강남본점\n- **Date**: Tomorrow (Feb 20) at 7:00 PM\n- **Party size**: 2 people\n- **Name**: Harrison\n- **Menu**: Premium Hanwoo Course\n\nShall I call the restaurant now to make this reservation?",
  collected: {
    ...BASE_COLLECTED,
    target_name: '본가 강남본점',
    target_phone: '02-666-5678',
    primary_datetime: '2026-02-20 19:00',
    service: '한우 특선 코스',
    customer_name: 'Harrison',
    party_size: 2,
  },
  is_complete: true,
  conversation_status: 'READY',
};

// Default fallback for extra messages
const CHAT_FALLBACK: ChatResponse = {
  message: "I'll proceed with the reservation. Click the call button when you're ready!",
  collected: CHAT_STEP_4.collected,
  is_complete: true,
  conversation_status: 'READY',
};

export const DEMO_CHAT_SEQUENCE: ChatResponse[] = [
  CHAT_STEP_1,
  CHAT_STEP_2,
  CHAT_STEP_3,
  CHAT_STEP_4,
  CHAT_FALLBACK,
];

// --- Call Creation Response ---
export const DEMO_CALL: Call = {
  id: DEMO_CALL_ID,
  userId: DEMO_USER_ID,
  conversationId: DEMO_CONVERSATION_ID,
  requestType: 'RESERVATION',
  targetName: '본가 강남본점',
  targetPhone: '02-666-5678',
  parsedDate: '2026-02-20',
  parsedTime: '19:00',
  parsedService: '한우 특선 코스',
  status: 'PENDING',
  result: null,
  summary: null,
  callMode: 'relay',
  communicationMode: 'voice_to_voice',
  relayWsUrl: undefined,
  callId: null,
  callSid: null,
  sourceLanguage: 'en',
  targetLanguage: 'ko',
  durationS: null,
  totalTokens: null,
  autoEnded: false,
  createdAt: new Date().toISOString(),
  completedAt: null,
};

// --- Call Start Response ---
export const DEMO_CALL_START_RESPONSE = {
  success: true,
  callId: DEMO_CALL_ID,
  relayWsUrl: 'mock://demo-call',
  callSid: 'CA_demo_mock_sid',
};

// --- Call Result (통화 완료 후) ---
export const DEMO_CALL_RESULT: Call = {
  ...DEMO_CALL,
  status: 'COMPLETED',
  result: 'SUCCESS',
  summary:
    'Successfully reserved a table for 2 at 본가 강남본점 for tomorrow (Feb 20) at 7:00 PM under the name Harrison. The restaurant confirmed the premium hanwoo course reservation.',
  durationS: 25,
  totalTokens: 3200,
  completedAt: new Date().toISOString(),
};

// --- WebSocket Caption Timeline ---
// { delayMs, type, data } — 시간순으로 이벤트 발생

export interface MockWsEvent {
  delayMs: number;
  type: string;
  data: Record<string, unknown>;
}

export const DEMO_CAPTION_TIMELINE: MockWsEvent[] = [
  // 0s: Ringing
  {
    delayMs: 0,
    type: 'call_status',
    data: { status: 'ringing', message: 'Calling 본가 강남본점...' },
  },

  // 3s: Connected
  {
    delayMs: 3000,
    type: 'call_status',
    data: { status: 'connected', message: 'Call connected' },
  },

  // 4s: AI speaks to restaurant (Korean - outbound)
  {
    delayMs: 4000,
    type: 'caption.original',
    data: {
      text: '안녕하세요, ',
      direction: 'outbound',
      role: 'ai',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 4300,
    type: 'caption.original',
    data: {
      text: '예약 문의 드립니다.',
      direction: 'outbound',
      role: 'ai',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 4600,
    type: 'caption.translated',
    data: {
      text: 'Hello, I\'d like to make a reservation.',
      direction: 'outbound',
      role: 'ai',
      language: 'en',
      stage: 2,
    },
  },

  // 7s: Restaurant responds (Korean - inbound)
  {
    delayMs: 7000,
    type: 'caption.original',
    data: {
      text: '네, 안녕하세요. ',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 7400,
    type: 'caption.original',
    data: {
      text: '몇 분이시고 언제 오실 건가요?',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 8000,
    type: 'caption.translated',
    data: {
      text: 'Yes, hello. How many people and when would you like to come?',
      direction: 'inbound',
      role: 'recipient',
      language: 'en',
      stage: 2,
    },
  },

  // 10.5s: AI responds (Korean - outbound)
  {
    delayMs: 10500,
    type: 'caption.original',
    data: {
      text: '내일 저녁 7시에 ',
      direction: 'outbound',
      role: 'ai',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 10800,
    type: 'caption.original',
    data: {
      text: '2명 한우 특선 코스로 예약 가능할까요?',
      direction: 'outbound',
      role: 'ai',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 11200,
    type: 'caption.translated',
    data: {
      text: 'Can we book the premium hanwoo course for 2 people tomorrow at 7 PM?',
      direction: 'outbound',
      role: 'ai',
      language: 'en',
      stage: 2,
    },
  },

  // 14s: Restaurant confirms (Korean - inbound)
  {
    delayMs: 14000,
    type: 'caption.original',
    data: {
      text: '네, 가능합니다. ',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 14400,
    type: 'caption.original',
    data: {
      text: '성함이 어떻게 되세요?',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 15000,
    type: 'caption.translated',
    data: {
      text: "Yes, that's available. May I have your name?",
      direction: 'inbound',
      role: 'recipient',
      language: 'en',
      stage: 2,
    },
  },

  // 17s: AI gives name (Korean - outbound)
  {
    delayMs: 17000,
    type: 'caption.original',
    data: {
      text: 'Harrison이요.',
      direction: 'outbound',
      role: 'ai',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 17400,
    type: 'caption.translated',
    data: {
      text: "It's Harrison.",
      direction: 'outbound',
      role: 'ai',
      language: 'en',
      stage: 2,
    },
  },

  // 20s: Restaurant confirms reservation (Korean - inbound)
  {
    delayMs: 20000,
    type: 'caption.original',
    data: {
      text: 'Harrison님, ',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 20300,
    type: 'caption.original',
    data: {
      text: '내일 저녁 7시 2명 한우 특선 코스 예약 완료했습니다. ',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 20600,
    type: 'caption.original',
    data: {
      text: '감사합니다.',
      direction: 'inbound',
      role: 'recipient',
      language: 'ko',
      stage: 1,
    },
  },
  {
    delayMs: 21200,
    type: 'caption.translated',
    data: {
      text: 'Harrison, your reservation for 2 people with the premium hanwoo course tomorrow at 7 PM is confirmed. Thank you.',
      direction: 'inbound',
      role: 'recipient',
      language: 'en',
      stage: 2,
    },
  },

  // 24s: Call ends
  {
    delayMs: 24000,
    type: 'call_status',
    data: { status: 'ended', message: 'Call completed successfully' },
  },
];
