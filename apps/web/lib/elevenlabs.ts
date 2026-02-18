// ============================================================================
// BE2-2: ElevenLabs Integration (Mock + Real)
// ============================================================================
// Owner: BE2
// Purpose: ElevenLabs Conversational AI + Twilio Outbound Call 연동
// ============================================================================

import type { CallResult, CollectedData } from '@/shared/types';
import {
  ELEVENLABS_POLL_INTERVAL_MS,
  ELEVENLABS_MAX_POLL_COUNT,
  ELEVENLABS_MAX_CONSECUTIVE_ERRORS,
  ELEVENLABS_TERMINAL_STATUSES,
} from '@/lib/constants';

// --- Types ---

export interface OutboundCallResponse {
  conversation_id: string;
  status: string;
}

export interface ElevenLabsConversation {
  conversation_id: string;
  status: string;
  analysis?: {
    transcript_summary?: string;
    data_collection_results?: Record<string, unknown>;
  };
  // ElevenLabs API returns transcript as string OR array of { role, message } objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transcript?: string | any[];
  metadata?: {
    call_duration_secs?: number;
  };
}

export interface StartCallParams {
  phoneNumber: string;
  dynamicVariables: Record<string, string>;
  systemPrompt: string;
}

export interface PollOptions {
  conversationId: string;
  onComplete: (conversation: ElevenLabsConversation) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

// --- Constants ---

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// --- Config & Validation ---

/**
 * Mock 모드 여부를 확인합니다.
 * ELEVENLABS_MOCK 환경변수가 'false'가 아닌 모든 경우 Mock 모드입니다 (기본값: true).
 */
export function isMockMode(): boolean {
  return process.env.ELEVENLABS_MOCK !== 'false';
}

/**
 * Real 모드에서 필요한 환경변수 3개가 모두 설정되어 있는지 검증합니다.
 * 누락 시 명확한 에러 메시지와 함께 throw합니다.
 */
export function validateElevenLabsConfig(): void {
  const required: Array<{ key: string; label: string }> = [
    { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key' },
    { key: 'ELEVENLABS_AGENT_ID', label: 'ElevenLabs Agent ID' },
    { key: 'ELEVENLABS_PHONE_NUMBER_ID', label: 'ElevenLabs Phone Number ID' },
  ];

  const missing = required.filter(({ key }) => !process.env[key]);

  if (missing.length > 0) {
    const names = missing.map((m) => `${m.key} (${m.label})`).join(', ');
    throw new Error(
      `Missing required ElevenLabs environment variables: ${names}. ` +
        'Please check your .env.local file. See docs/04_SETUP-GUIDE.md for details.',
    );
  }
}

// --- Phone Number Formatting ---

/**
 * 한국 전화번호를 E.164 형식으로 변환합니다.
 *
 * | 입력              | 출력             |
 * |-------------------|------------------|
 * | 010-1234-5678     | +821012345678    |
 * | 01012345678       | +821012345678    |
 * | 02-123-4567       | +8221234567      |
 * | 031-123-4567      | +82311234567     |
 * | +821012345678     | +821012345678    |
 */
export function formatPhoneToE164(phone: string): string {
  // 숫자와 + 외 모든 문자 제거
  const cleaned = phone.replace(/[^\d+]/g, '');

  // 이미 E.164 형식
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // 0으로 시작하는 한국 번호 → 0 제거 후 +82 붙이기
  if (cleaned.startsWith('0')) {
    return '+82' + cleaned.slice(1);
  }

  // 그 외 → +82 + 전체
  return '+82' + cleaned;
}

// --- Outbound Call ---

/**
 * ElevenLabs Outbound Call을 시작합니다.
 *
 * Mock 모드: 즉시 mock conversation_id 반환
 * Real 모드: ElevenLabs API 호출 (POST /v1/convai/twilio/outbound-call)
 *
 * CRITICAL: Real 모드 사용 시 ElevenLabs Dashboard에서 다음 설정이 필요합니다:
 * - Agent → Settings → Security → "Enable overrides" 체크
 * - Override Options → "System prompt" 체크
 */
export async function startOutboundCall(
  params: StartCallParams,
): Promise<OutboundCallResponse> {
  const { phoneNumber, dynamicVariables, systemPrompt } = params;

  // --- Mock Mode ---
  if (isMockMode()) {
    console.log('[ElevenLabs Mock] Starting mock outbound call');
    console.log('[ElevenLabs Mock] Phone:', maskPhone(phoneNumber));
    console.log('[ElevenLabs Mock] Variables:', Object.keys(dynamicVariables));
    return {
      conversation_id: `mock_${Date.now()}`,
      status: 'initiated',
    };
  }

  // --- Real Mode ---
  validateElevenLabsConfig();

  const e164Phone = formatPhoneToE164(phoneNumber);

  console.log('[ElevenLabs] Starting outbound call', {
    phone: maskPhone(e164Phone),
    agentId: process.env.ELEVENLABS_AGENT_ID,
  });

  // 첫 인사: 짧게만 말해 상대방 "네, OOO입니다"와 겹치지 않게 함 (겹치면 통화 끊김)
  const firstMessage =
    '잠시만 기다려 주세요.';

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/convai/twilio/outbound-call`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: e164Phone,
        conversation_initiation_client_data: {
          dynamic_variables: dynamicVariables,
          conversation_config_override: {
            agent: {
              prompt: {
                prompt: systemPrompt,
              },
              first_message: firstMessage,
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      '[ElevenLabs] Outbound call failed:',
      response.status,
      errorText,
    );
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();
  console.log('[ElevenLabs] Call initiated:', data.conversation_id);

  return data as OutboundCallResponse;
}

// --- Conversation Status ---

/**
 * ElevenLabs Conversation 상태를 조회합니다.
 *
 * Mock 모드: 즉시 completed 상태 반환
 * Real 모드: ElevenLabs API 호출 (GET /v1/convai/conversations/{id})
 */
export async function getConversation(
  conversationId: string,
): Promise<ElevenLabsConversation> {
  // Mock mode
  if (isMockMode()) {
    return {
      conversation_id: conversationId,
      status: 'done',
      analysis: {
        transcript_summary:
          'Mock 통화가 성공적으로 완료되었습니다. 요청하신 내용이 처리되었습니다.',
      },
      transcript: 'Mock transcript - 통화 내용이 여기에 표시됩니다.',
    };
  }

  // Real mode
  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/convai/conversations/${conversationId}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      '[ElevenLabs] Get conversation failed:',
      response.status,
      errorText,
    );
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as ElevenLabsConversation;
}

// --- Result Determination (7-step priority algorithm) ---

/**
 * 통화 결과를 판정하는 7단계 우선순위 알고리즘입니다.
 *
 * 1. ElevenLabs status가 failed/terminated → ERROR
 * 2. analysis.data_collection_results에 result 필드 → 해당 값
 * 3. transcript_summary에 성공 키워드 → SUCCESS
 * 4. transcript_summary에 거절 키워드 → REJECTED
 * 5. transcript_summary에 부재 키워드 → NO_ANSWER
 * 6. transcript가 비어있거나 매우 짧음 → NO_ANSWER
 * 7. 기본값 → SUCCESS (통화가 이루어졌으므로)
 */
export function determineCallResult(
  conversation: ElevenLabsConversation,
): CallResult {
  const { status, analysis, transcript } = conversation;

  // Step 1: Terminal failure statuses
  if (status === 'failed' || status === 'terminated') {
    console.log('[Result] Step 1: Terminal failure status →', status);
    // 전화 받은 후 끊김 디버깅: ElevenLabs가 failed로 끝낸 경우 상세 로그
    if (conversation.analysis?.transcript_summary) {
      console.log('[Result] transcript_summary:', conversation.analysis.transcript_summary);
    }
    const duration = conversation.metadata?.call_duration_secs;
    if (duration != null) {
      console.log('[Result] call_duration_secs:', duration);
      if (duration <= 3) {
        console.warn(
          '[Result] 통화가 2~3초 만에 끊김 → ElevenLabs Agent의 Turn Timeout이 너무 짧을 수 있습니다. ' +
            'Dashboard → Agent → Advanced → Turn Timeout을 10~15초로 늘려보세요. (docs/11_ELEVENLABS_TWILIO_TROUBLESHOOTING.md)',
        );
      }
    }
    return 'ERROR';
  }

  // Step 2: Check data_collection_results
  if (analysis?.data_collection_results) {
    const results = analysis.data_collection_results;
    if ('result' in results && typeof results.result === 'string') {
      const mapped = mapResultString(results.result);
      if (mapped) {
        console.log('[Result] Step 2: data_collection_results →', mapped);
        return mapped;
      }
    }
  }

  const summary = analysis?.transcript_summary || '';

  // Step 3: Success keywords
  const successKeywords = [
    '예약 완료',
    '예약이 완료',
    '예약되었',
    '예약됐',
    '확인 완료',
    '접수 완료',
    '접수되었',
    '가능합니다',
    '예약해 드렸',
    '예약해드렸',
  ];
  if (successKeywords.some((kw) => summary.includes(kw))) {
    console.log('[Result] Step 3: Success keyword found in summary');
    return 'SUCCESS';
  }

  // Step 4: Rejection keywords
  const rejectionKeywords = [
    '거절',
    '불가',
    '안 됩니다',
    '안됩니다',
    '어렵습니다',
    '마감',
    '꽉 찼',
    '자리가 없',
    '예약이 안',
  ];
  if (rejectionKeywords.some((kw) => summary.includes(kw))) {
    console.log('[Result] Step 4: Rejection keyword found in summary');
    return 'REJECTED';
  }

  // Step 5: No answer keywords
  const noAnswerKeywords = [
    '부재',
    '받지 않',
    '연결되지',
    '응답 없',
    '통화중',
    '연결 실패',
    '전화를 받지',
  ];
  if (noAnswerKeywords.some((kw) => summary.includes(kw))) {
    console.log('[Result] Step 5: No answer keyword found in summary');
    return 'NO_ANSWER';
  }

  // Step 6: Empty or very short transcript
  // transcript can be a string or an array of objects from ElevenLabs API
  const transcriptText =
    typeof transcript === 'string'
      ? transcript
      : Array.isArray(transcript)
        ? (transcript as Array<{ message?: string }>)
            .map((t) => t.message || '')
            .join(' ')
        : '';
  if (!transcriptText || transcriptText.trim().length < 50) {
    console.log('[Result] Step 6: Empty/short transcript → NO_ANSWER');
    return 'NO_ANSWER';
  }

  // Step 7: Default to SUCCESS
  console.log('[Result] Step 7: Default → SUCCESS');
  return 'SUCCESS';
}

function mapResultString(result: string): CallResult | null {
  const upper = result.toUpperCase();
  if (upper === 'SUCCESS' || upper === 'CONFIRMED') return 'SUCCESS';
  if (upper === 'NO_ANSWER') return 'NO_ANSWER';
  if (upper === 'REJECTED' || upper === 'DECLINED') return 'REJECTED';
  if (upper === 'ERROR' || upper === 'FAILED') return 'ERROR';
  return null;
}

// --- Background Polling ---

/**
 * ElevenLabs Conversation 상태를 백그라운드에서 폴링합니다.
 * 통화 종료 시 onComplete, 에러 시 onError 콜백을 실행합니다.
 *
 * - 폴링 간격: 3초
 * - 최대 폴링 횟수: 60회 (= 3분)
 * - 연속 에러 허용: 5회
 * - 종료 조건: ElevenLabs status가 terminal (done/completed/failed/ended/terminated)
 */
export function startPolling(options: PollOptions): void {
  const { conversationId, onComplete, onError } = options;

  let pollCount = 0;
  let consecutiveErrors = 0;

  const poll = async () => {
    pollCount++;
    console.log(
      `[ElevenLabs Poll] Attempt ${pollCount}/${ELEVENLABS_MAX_POLL_COUNT} for ${conversationId}`,
    );

    // 최대 폴링 횟수 초과
    if (pollCount > ELEVENLABS_MAX_POLL_COUNT) {
      console.warn(
        `[ElevenLabs Poll] Timeout for ${conversationId} after ${ELEVENLABS_MAX_POLL_COUNT} attempts`,
      );
      await onError(
        new Error(
          'Polling timeout: conversation did not complete within 3 minutes',
        ),
      );
      return;
    }

    try {
      const conversation = await getConversation(conversationId);
      consecutiveErrors = 0; // 성공 시 리셋

      const isTerminal = ELEVENLABS_TERMINAL_STATUSES.includes(conversation.status as typeof ELEVENLABS_TERMINAL_STATUSES[number]);

      if (isTerminal) {
        console.log(
          `[ElevenLabs Poll] Terminal status reached: ${conversation.status}`,
        );
        await onComplete(conversation);
        return;
      }

      // 아직 종료되지 않음 → 다음 폴링 예약
      setTimeout(poll, ELEVENLABS_POLL_INTERVAL_MS);
    } catch (error) {
      consecutiveErrors++;
      console.error(
        `[ElevenLabs Poll] Error (${consecutiveErrors}/${ELEVENLABS_MAX_CONSECUTIVE_ERRORS}):`,
        error,
      );

      // 연속 에러 임계치 초과
      if (consecutiveErrors >= ELEVENLABS_MAX_CONSECUTIVE_ERRORS) {
        console.error(
          `[ElevenLabs Poll] ${ELEVENLABS_MAX_CONSECUTIVE_ERRORS} consecutive errors, stopping`,
        );
        await onError(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }

      // 간헐적 에러 → 폴링 계속
      setTimeout(poll, ELEVENLABS_POLL_INTERVAL_MS);
    }
  };

  // 첫 폴링은 interval 후 시작
  setTimeout(poll, ELEVENLABS_POLL_INTERVAL_MS);
}

// --- Mock Summary Generation ---

/**
 * Mock 모드에서 collected_data 기반으로 통화 결과 요약을 생성합니다.
 */
export function generateMockSummary(collectedData: CollectedData): string {
  const targetName = collectedData.target_name || '상대방';
  const service = collectedData.service || '용건';
  const datetime = collectedData.primary_datetime || '';
  const scenarioType = collectedData.scenario_type || 'RESERVATION';

  switch (scenarioType) {
    case 'RESERVATION':
      return `${targetName}에 ${datetime ? datetime + ' ' : ''}${service} 예약이 완료되었습니다.`;

    case 'INQUIRY':
      return `${targetName}에 ${service} 관련 문의가 완료되었습니다. 자세한 내용은 통화 기록을 확인해주세요.`;

    case 'AS_REQUEST':
      return `${targetName}에 ${service} AS 접수가 완료되었습니다.${datetime ? ` 방문 예정일: ${datetime}` : ''}`;

    default:
      return `${targetName}에 ${service} 관련 통화가 완료되었습니다.`;
  }
}

// --- Utilities ---

/** 전화번호 마스킹 (로그 출력용) */
function maskPhone(phone: string): string {
  if (phone.length <= 7) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-4);
}
