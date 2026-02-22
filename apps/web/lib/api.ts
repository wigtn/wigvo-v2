import type {
  Conversation,
  ChatResponse,
  Call,
  CreateConversationResponse,
  ScenarioType,
  ScenarioSubType,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { isDemoMode } from '@/lib/demo';
import {
  mockCreateConversation,
  mockGetConversation,
  mockSendChatMessage,
  mockCreateCall,
  mockStartCall,
  mockGetCall,
} from '@/lib/demo/mock-api';

// ============================================================
// API Helper Functions
// ============================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Conversation ──────────────────────────────────────────────

/**
 * 새 대화 시작 (v5: 모드 + 시나리오 타입 + 언어 지원)
 */
export async function createConversation(
  scenarioType?: ScenarioType,
  subType?: ScenarioSubType,
  communicationMode?: CommunicationMode,
  sourceLang?: string,
  targetLang?: string,
  locale?: string
): Promise<CreateConversationResponse> {
  if (isDemoMode()) return mockCreateConversation();
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioType, subType, communicationMode, sourceLang, targetLang, locale }),
  });
  return handleResponse<CreateConversationResponse>(response);
}

export async function getConversation(id: string): Promise<Conversation> {
  if (isDemoMode()) return mockGetConversation(id);
  const response = await fetch(`/api/conversations/${id}`);
  return handleResponse<Conversation>(response);
}

// ── Chat ──────────────────────────────────────────────────────

export async function sendChatMessage(
  conversationId: string,
  message: string,
  communicationMode?: CommunicationMode,
  locale?: string
): Promise<ChatResponse> {
  if (isDemoMode()) return mockSendChatMessage(conversationId, message, communicationMode, locale);
  const body: Record<string, unknown> = { conversationId, message };
  if (communicationMode) {
    body.communicationMode = communicationMode;
  }
  if (locale) {
    body.locale = locale;
  }
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ChatResponse>(response);
}

// ── Calls ─────────────────────────────────────────────────────

export async function createCall(
  conversationId: string,
  communicationMode?: CommunicationMode,
): Promise<Call> {
  if (isDemoMode()) return mockCreateCall();
  const response = await fetch('/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, communicationMode }),
  });
  return handleResponse<Call>(response);
}

export async function startCall(callId: string): Promise<{
  success: boolean;
  callId: string;
  relayWsUrl?: string;
  callSid?: string;
}> {
  if (isDemoMode()) return mockStartCall();
  const response = await fetch(`/api/calls/${callId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<{
    success: boolean;
    callId: string;
    relayWsUrl?: string;
    callSid?: string;
  }>(response);
}

export async function getCall(id: string): Promise<Call> {
  if (isDemoMode()) return mockGetCall(id);
  const response = await fetch(`/api/calls/${id}`);
  return handleResponse<Call>(response);
}
