import type { 
  Conversation, 
  ChatResponse, 
  Call,
  CreateConversationResponse,
  ScenarioType,
  ScenarioSubType,
} from '@/shared/types';

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
 * 새 대화 시작 (v4: 시나리오 타입 지원)
 */
export async function createConversation(
  scenarioType?: ScenarioType,
  subType?: ScenarioSubType
): Promise<CreateConversationResponse> {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioType, subType }),
  });
  return handleResponse<CreateConversationResponse>(response);
}

export async function getConversation(id: string): Promise<Conversation> {
  const response = await fetch(`/api/conversations/${id}`);
  return handleResponse<Conversation>(response);
}

// ── Chat ──────────────────────────────────────────────────────

export async function sendChatMessage(
  conversationId: string,
  message: string,
  previousSearchResults?: Array<{ name: string; address: string; roadAddress: string; telephone: string; category: string; mapx: number; mapy: number }>
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { conversationId, message };
  if (previousSearchResults && previousSearchResults.length > 0) {
    body.previousSearchResults = previousSearchResults;
  }
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<ChatResponse>(response);
}

// ── Calls ─────────────────────────────────────────────────────

export async function createCall(conversationId: string): Promise<Call> {
  const response = await fetch('/api/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  });
  return handleResponse<Call>(response);
}

export async function startCall(callId: string): Promise<{
  success: boolean;
  callId: string;
  relayWsUrl?: string;
  callSid?: string;
}> {
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
  const response = await fetch(`/api/calls/${id}`);
  return handleResponse<Call>(response);
}
