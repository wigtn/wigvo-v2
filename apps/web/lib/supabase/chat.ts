// =============================================================================
// WIGVO Chat DB Functions (v4)
// =============================================================================
// BE1 소유 - 대화 관련 Supabase 데이터베이스 함수
// v4: 시나리오 타입 지원
// =============================================================================

import { createClient } from './server';
import {
  CollectedData,
  ConversationStatus,
  ScenarioType,
  ScenarioSubType,
  createEmptyCollectedData,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { GREETING_MESSAGE } from '@/lib/prompts';
import { getScenarioGreeting } from '@/lib/scenarios/config';
import { CONVERSATION_HISTORY_LIMIT } from '@/lib/constants';

// -----------------------------------------------------------------------------
// DB Row Types (snake_case)
// -----------------------------------------------------------------------------
interface ConversationRow {
  id: string;
  user_id: string;
  status: ConversationStatus;
  collected_data: CollectedData;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// -----------------------------------------------------------------------------
// createConversation (v4: 시나리오 타입 지원)
// -----------------------------------------------------------------------------
/**
 * 새 대화 세션 생성 + 초기 인사 메시지 저장
 * @param userId - 사용자 ID
 * @param scenarioType - 시나리오 타입 (선택적)
 * @param subType - 서브 시나리오 타입 (선택적)
 * @param communicationMode - 통화 모드 (선택적, v5: 모드별 인사 분기)
 */
export async function createConversation(
  userId: string,
  scenarioType?: ScenarioType,
  subType?: ScenarioSubType,
  communicationMode?: CommunicationMode,
  sourceLang?: string,
  targetLang?: string
) {
  const supabase = await createClient();

  // 1. v5: 시나리오 타입 + 모드 + 언어 설정
  const initialCollectedData = createEmptyCollectedData();
  if (scenarioType) {
    initialCollectedData.scenario_type = scenarioType;
  }
  if (subType) {
    initialCollectedData.scenario_sub_type = subType;
  }
  if (sourceLang) {
    initialCollectedData.source_language = sourceLang;
  }
  if (targetLang) {
    initialCollectedData.target_language = targetLang;
  }

  // 2. 대화 세션 생성
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      status: 'COLLECTING',
      collected_data: initialCollectedData,
    })
    .select()
    .single();

  if (convError || !conversation) {
    throw new Error(`Failed to create conversation: ${convError?.message}`);
  }

  // 3. v5: 모드 + 시나리오별 인사 메시지 선택
  const greeting = scenarioType && subType
    ? getScenarioGreeting(scenarioType, subType, communicationMode)
    : GREETING_MESSAGE;

  // 4. 초기 인사 메시지 저장
  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    role: 'assistant',
    content: greeting,
    metadata: {},
  });

  if (msgError) {
    throw new Error(`Failed to save greeting message: ${msgError.message}`);
  }

  return {
    conversation: conversation as ConversationRow,
    greeting,
  };
}

// -----------------------------------------------------------------------------
// getConversationHistory
// -----------------------------------------------------------------------------
/**
 * 대화 기록 조회 (LLM 컨텍스트용, 최근 20개)
 * - created_at 오름차순 정렬 필수
 */
export async function getConversationHistory(conversationId: string) {
  const supabase = await createClient();

  const { data: messages, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(CONVERSATION_HISTORY_LIMIT);

  if (error) {
    throw new Error(`Failed to get conversation history: ${error.message}`);
  }

  return (messages || []) as Pick<MessageRow, 'role' | 'content' | 'created_at'>[];
}

// -----------------------------------------------------------------------------
// saveMessage
// -----------------------------------------------------------------------------
/**
 * 메시지 저장
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = await createClient();

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }

  return message as MessageRow;
}

// -----------------------------------------------------------------------------
// updateCollectedData
// -----------------------------------------------------------------------------
/**
 * collected_data + status 업데이트
 */
export async function updateCollectedData(
  conversationId: string,
  collectedData: CollectedData,
  status?: ConversationStatus
) {
  const supabase = await createClient();

  const updateData: {
    collected_data: CollectedData;
    updated_at: string;
    status?: ConversationStatus;
  } = {
    collected_data: collectedData,
    updated_at: new Date().toISOString(),
  };

  if (status) {
    updateData.status = status;
  }

  const { error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update collected data: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// getConversation
// -----------------------------------------------------------------------------
/**
 * 대화 세션 + 메시지 전체 조회 (복구용)
 * - 메시지는 created_at 오름차순 정렬
 */
export async function getConversation(conversationId: string) {
  const supabase = await createClient();

  // 대화 세션 조회
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    return null;
  }

  // 메시지 별도 조회 (정렬 보장)
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (msgError) {
    throw new Error(`Failed to get messages: ${msgError.message}`);
  }

  return {
    ...(conversation as ConversationRow),
    messages: (messages || []) as Pick<
      MessageRow,
      'id' | 'role' | 'content' | 'created_at'
    >[],
  };
}

// -----------------------------------------------------------------------------
// getConversationById (상태만 조회)
// -----------------------------------------------------------------------------
/**
 * 대화 세션 조회 (메시지 제외)
 */
export async function getConversationById(conversationId: string) {
  const supabase = await createClient();

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !conversation) {
    return null;
  }

  return conversation as ConversationRow;
}

// -----------------------------------------------------------------------------
// updateConversationStatus
// -----------------------------------------------------------------------------
/**
 * 대화 상태만 업데이트
 */
export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('conversations')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update conversation status: ${error.message}`);
  }
}
