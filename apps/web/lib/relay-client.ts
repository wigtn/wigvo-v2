// =============================================================================
// Relay Server HTTP Client (server-side only)
// =============================================================================
// Relay Server API와 통신하는 클라이언트
// =============================================================================

import type { CallStartParams, CallStartResult } from '@/shared/call-types';

const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL || 'http://localhost:8000';

/**
 * Relay Server에 통화 시작 요청을 보냅니다.
 * POST /relay/calls/start
 */
export async function startRelayCall(params: CallStartParams): Promise<CallStartResult> {
  const response = await fetch(`${RELAY_SERVER_URL}/relay/calls/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[RelayClient] startRelayCall failed:', response.status, errorText);
    throw new Error(`Relay Server error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as CallStartResult;
}

/**
 * Relay Server에 통화 종료 요청을 보냅니다.
 * POST /relay/calls/{call_id}/end
 */
export async function endRelayCall(callId: string, reason?: string): Promise<void> {
  const response = await fetch(`${RELAY_SERVER_URL}/relay/calls/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_id: callId, reason: reason || 'user_hangup' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[RelayClient] endRelayCall failed:', response.status, errorText);
    throw new Error(`Relay Server error (${response.status}): ${errorText}`);
  }
}

/**
 * 한국 전화번호를 E.164 형식으로 변환합니다.
 *
 * | 입력              | 출력             |
 * |-------------------|------------------|
 * | 010-1234-5678     | +821012345678    |
 * | 01012345678       | +821012345678    |
 * | 02-123-4567       | +8221234567      |
 * | +821012345678     | +821012345678    |
 */
export function formatPhoneToE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('0')) {
    return '+82' + cleaned.slice(1);
  }

  return '+82' + cleaned;
}
