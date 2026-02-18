// =============================================================================
// WIGVO Constants
// =============================================================================
// 프로젝트 전역 상수 정의
// =============================================================================

// -----------------------------------------------------------------------------
// Chat / LLM
// -----------------------------------------------------------------------------

/** LLM 컨텍스트에 포함할 최근 메시지 수 */
export const LLM_CONTEXT_MESSAGE_LIMIT = 10;

/** 대화 기록 조회 시 최대 메시지 수 */
export const CONVERSATION_HISTORY_LIMIT = 20;

/** 대화 목록 조회 시 최대 개수 */
export const CONVERSATION_LIST_LIMIT = 20;

/** 사용자 메시지 최대 길이 */
export const MAX_MESSAGE_LENGTH = 1000;

/** Function Calling 최대 반복 횟수 */
export const MAX_TOOL_CALL_LOOPS = 3;

// -----------------------------------------------------------------------------
// Naver Maps
// -----------------------------------------------------------------------------

/** 장소 검색 최대 결과 수 */
export const NAVER_SEARCH_DISPLAY_COUNT = 5;

// -----------------------------------------------------------------------------
// ElevenLabs
// -----------------------------------------------------------------------------

/** 폴링 간격 (밀리초) */
export const ELEVENLABS_POLL_INTERVAL_MS = 3000;

/** 최대 폴링 횟수 (60 * 3초 = 3분) */
export const ELEVENLABS_MAX_POLL_COUNT = 60;

/** 연속 에러 허용 횟수 */
export const ELEVENLABS_MAX_CONSECUTIVE_ERRORS = 5;

/** Mock 모드 자동 완료 대기 시간 (밀리초) */
export const ELEVENLABS_MOCK_COMPLETION_DELAY_MS = 5000;

/** 통화 종료 상태 목록 */
export const ELEVENLABS_TERMINAL_STATUSES = [
  'done',
  'completed',
  'failed',
  'ended',
  'terminated',
] as const;

// -----------------------------------------------------------------------------
// Relay Server
// -----------------------------------------------------------------------------

/** Relay Server HTTP URL (서버사이드) */
export const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL || 'http://localhost:8000';

/** Relay Server WebSocket URL (클라이언트사이드) */
export const RELAY_WS_URL = process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://localhost:8000';

// --- VAD (Voice Activity Detection) ---

/** RMS speech 임계값 */
export const VAD_SPEECH_THRESHOLD = 0.015;

/** RMS silence 임계값 */
export const VAD_SILENCE_THRESHOLD = 0.008;

/** 발화 시작 지연 (ms) */
export const VAD_SPEECH_ONSET_DELAY = 150;

/** 발화 종료 지연 (ms) */
export const VAD_SPEECH_END_DELAY = 350;

/** 오디오 청크 크기 (100ms @ 16kHz mono) */
export const VAD_CHUNK_SIZE = 1600;

// -----------------------------------------------------------------------------
// UI / UX
// -----------------------------------------------------------------------------

/** 에러 메시지 자동 디스미스 시간 (밀리초) */
export const ERROR_AUTO_DISMISS_MS = 5000;

/** localStorage 키: 현재 대화 ID */
export const STORAGE_KEY_CONVERSATION_ID = 'currentConversationId';

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/** 한국 전화번호 정규식 */
export const PHONE_NUMBER_REGEX = /^(0[0-9]{1,2})[0-9]{3,4}[0-9]{4}$/;

/** UUID v4 정규식 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 위도 범위 (한국) */
export const LAT_RANGE = { min: 33, max: 43 } as const;

/** 경도 범위 (한국) */
export const LNG_RANGE = { min: 124, max: 132 } as const;
