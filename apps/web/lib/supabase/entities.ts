// =============================================================================
// WIGVO Entity Management Functions (v3)
// =============================================================================
// BE1 소유 - 구조화된 Entity 저장 및 조회
// Phase 3: 대화에서 수집된 정보를 개별 Entity로 관리
// =============================================================================

import { createClient } from './server';
import { CollectedData } from '@/shared/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export interface ConversationEntity {
  id: string;
  conversation_id: string;
  entity_type: string;
  entity_value: string;
  confidence: number;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// extractAndSaveEntities
// -----------------------------------------------------------------------------
/**
 * LLM 응답에서 Entity를 추출하여 DB에 저장
 * 
 * @param conversationId - 대화 세션 ID
 * @param messageId - 소스 메시지 ID (어느 메시지에서 추출했는지)
 * @param collectedData - LLM이 반환한 수집 데이터
 */
export async function extractAndSaveEntities(
  conversationId: string,
  messageId: string,
  collectedData: Partial<CollectedData>
): Promise<void> {
  const supabase = await createClient();
  
  const entities: Array<{
    entity_type: string;
    entity_value: string;
    confidence: number;
  }> = [];

  // collected 객체를 개별 entity로 변환
  Object.entries(collectedData).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        // 배열은 JSON 문자열로 저장 (예: fallback_datetimes)
        if (value.length > 0) {
          entities.push({
            entity_type: key,
            entity_value: JSON.stringify(value),
            confidence: 0.9, // 배열은 약간 낮은 신뢰도
          });
        }
      } else if (typeof value === 'number') {
        entities.push({
          entity_type: key,
          entity_value: String(value),
          confidence: 1.0,
        });
      } else if (typeof value === 'string' && value.trim() !== '') {
        entities.push({
          entity_type: key,
          entity_value: value,
          confidence: 1.0, // 명시적 추출은 높은 신뢰도
        });
      }
    }
  });

  // DB에 저장 (upsert)
  for (const entity of entities) {
    const { error } = await supabase
      .from('conversation_entities')
      .upsert(
        {
          conversation_id: conversationId,
          entity_type: entity.entity_type,
          entity_value: entity.entity_value,
          confidence: entity.confidence,
          source_message_id: messageId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'conversation_id,entity_type',
        }
      );

    if (error) {
      console.error(`Failed to save entity ${entity.entity_type}:`, error);
    }
  }
}

// -----------------------------------------------------------------------------
// getConversationEntities
// -----------------------------------------------------------------------------
/**
 * 대화 세션의 모든 Entity 조회
 * 
 * @param conversationId - 대화 세션 ID
 * @returns Entity 목록
 */
export async function getConversationEntities(
  conversationId: string
): Promise<ConversationEntity[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversation_entities')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to get conversation entities:', error);
    return [];
  }

  return (data || []) as ConversationEntity[];
}

// -----------------------------------------------------------------------------
// getEntityByType
// -----------------------------------------------------------------------------
/**
 * 특정 타입의 Entity 조회
 * 
 * @param conversationId - 대화 세션 ID
 * @param entityType - Entity 타입 (예: 'target_name', 'target_phone')
 * @returns Entity 또는 null
 */
export async function getEntityByType(
  conversationId: string,
  entityType: string
): Promise<ConversationEntity | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversation_entities')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('entity_type', entityType)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ConversationEntity;
}

// -----------------------------------------------------------------------------
// deleteEntity
// -----------------------------------------------------------------------------
/**
 * Entity 삭제
 * 
 * @param conversationId - 대화 세션 ID
 * @param entityType - Entity 타입
 */
export async function deleteEntity(
  conversationId: string,
  entityType: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('conversation_entities')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('entity_type', entityType);

  if (error) {
    console.error(`Failed to delete entity ${entityType}:`, error);
  }
}

// -----------------------------------------------------------------------------
// entitiesToCollectedData
// -----------------------------------------------------------------------------
/**
 * Entity 목록을 CollectedData 객체로 변환
 * 
 * @param entities - Entity 목록
 * @returns CollectedData 객체
 */
export function entitiesToCollectedData(
  entities: ConversationEntity[]
): Partial<CollectedData> {
  const result: Partial<CollectedData> = {};

  for (const entity of entities) {
    const { entity_type, entity_value } = entity;

    switch (entity_type) {
      case 'target_name':
      case 'target_phone':
      case 'scenario_type':
      case 'primary_datetime':
      case 'service':
      case 'fallback_action':
      case 'customer_name':
      case 'special_request':
        (result as Record<string, string>)[entity_type] = entity_value;
        break;
      case 'party_size':
        result.party_size = parseInt(entity_value, 10) || null;
        break;
      case 'fallback_datetimes':
        try {
          result.fallback_datetimes = JSON.parse(entity_value);
        } catch {
          result.fallback_datetimes = [];
        }
        break;
    }
  }

  return result;
}
