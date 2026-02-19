// =============================================================================
// Demo Mode — Mock API Functions
// =============================================================================
// lib/api.ts 와 동일한 인터페이스, Mock 데이터 반환
// =============================================================================

import type {
  Conversation,
  ChatResponse,
  Call,
  CreateConversationResponse,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import {
  DEMO_CONVERSATION_ID,
  DEMO_CONVERSATION,
  DEMO_CHAT_SEQUENCE,
  DEMO_CALL_ID,
  DEMO_CALL,
  DEMO_CALL_START_RESPONSE,
  DEMO_CALL_RESULT,
  DEMO_USER_ID,
} from './mock-data';

// --- State: 채팅 step 카운터 (몇 번째 메시지인지 추적) ---
let chatStepIndex = 0;

/** 데모 리셋 (새 대화 시작 시) */
export function resetDemoState(): void {
  chatStepIndex = 0;
}

// --- Mock API Functions ---

export async function mockCreateConversation(): Promise<CreateConversationResponse> {
  resetDemoState();
  // 300ms 지연으로 자연스러운 로딩 표현
  await delay(300);
  return { ...DEMO_CONVERSATION, createdAt: new Date().toISOString() };
}

export async function mockGetConversation(id: string): Promise<Conversation> {
  await delay(200);
  const lastChat = DEMO_CHAT_SEQUENCE[Math.min(chatStepIndex - 1, DEMO_CHAT_SEQUENCE.length - 1)];
  return {
    id: id || DEMO_CONVERSATION_ID,
    userId: DEMO_USER_ID,
    status: lastChat?.conversation_status ?? 'COLLECTING',
    collectedData: lastChat?.collected ?? DEMO_CONVERSATION.collectedData,
    messages: [],
    createdAt: DEMO_CONVERSATION.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export async function mockSendChatMessage(
  _conversationId: string,
  _message: string,
  _previousSearchResults?: unknown[],
  _communicationMode?: CommunicationMode,
  _locale?: string,
): Promise<ChatResponse> {
  // 현재 step의 응답 반환
  const step = Math.min(chatStepIndex, DEMO_CHAT_SEQUENCE.length - 1);
  const response = DEMO_CHAT_SEQUENCE[step];
  chatStepIndex++;

  // 자연스러운 타이핑 지연 (800ms ~ 1.5s)
  await delay(800 + Math.random() * 700);
  return { ...response };
}

export async function mockCreateCall(): Promise<Call> {
  await delay(400);
  return { ...DEMO_CALL, createdAt: new Date().toISOString() };
}

export async function mockStartCall(): Promise<{
  success: boolean;
  callId: string;
  relayWsUrl?: string;
  callSid?: string;
}> {
  await delay(600);
  return { ...DEMO_CALL_START_RESPONSE };
}

export async function mockGetCall(id: string): Promise<Call> {
  await delay(200);
  // 통화 완료된 상태 반환
  return { ...DEMO_CALL_RESULT, id: id || DEMO_CALL_ID };
}

// --- Utility ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
