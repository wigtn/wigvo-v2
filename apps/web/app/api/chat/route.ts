// =============================================================================
// POST /api/chat - 메시지 전송
// =============================================================================
// BE1 소유 - 사용자 메시지 처리 + LLM 응답
// API Contract: Endpoint 0-2
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getConversationHistory,
  saveMessage,
  updateCollectedData,
  getConversationById,
} from '@/lib/supabase/chat';
import { extractAndSaveEntities } from '@/lib/supabase/entities';
import { ChatRequestSchema, validateRequest } from '@/lib/validation';
import { processChat, isReadyForCall } from '@/lib/services/chat-service';
import { CollectedData, mergeCollectedData } from '@/shared/types';

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 요청 파싱 및 검증
    const body = await request.json();
    const validation = validateRequest(ChatRequestSchema, body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { conversationId, message, communicationMode, locale } =
      validation.data;

    // 3. 대화 세션 확인
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // 4. 사용자 메시지 저장
    await saveMessage(conversationId, 'user', message);

    // 5. 대화 기록 조회
    const history = await getConversationHistory(conversationId);

    // 6. 기존 수집 정보 가져오기
    const existingData = conversation.collected_data as CollectedData;

    // 7. Chat 처리 (서비스 레이어)
    let chatResult;
    try {
      chatResult = await processChat({
        existingData,
        history,
        userMessage: message,
        communicationMode,
        locale,
      });
    } catch (llmError) {
      console.error('OpenAI API error:', llmError);
      const errorMessage =
        '죄송합니다, 잠시 오류가 발생했어요. 다시 말씀해주세요.';

      return NextResponse.json({
        message: errorMessage,
        collected: conversation.collected_data,
        is_complete: false,
        conversation_status: conversation.status,
      });
    }

    // 8. collected_data 병합 (null 보존 강화)
    const mergedData = mergeCollectedData(existingData, chatResult.collected, true);

    // 9. Assistant 메시지 저장
    const savedMessage = await saveMessage(
      conversationId,
      'assistant',
      chatResult.message,
      {
        collected: chatResult.collected,
        is_complete: chatResult.is_complete,
      }
    );

    // 10. Entity 추출 및 저장
    if (chatResult.collected && savedMessage?.id) {
      try {
        await extractAndSaveEntities(
          conversationId,
          savedMessage.id,
          chatResult.collected as CollectedData
        );
      } catch (entityError) {
        console.warn('[Entity] Failed to save entities:', entityError);
      }
    }

    // 11. 상태 결정 및 업데이트
    const { ready, forceReady } = isReadyForCall(mergedData, chatResult.is_complete, communicationMode);
    const newStatus = ready ? 'READY' : 'COLLECTING';
    const effectiveComplete = chatResult.is_complete || forceReady;

    await updateCollectedData(conversationId, mergedData, newStatus);

    // 12. 응답 반환
    return NextResponse.json({
      message: chatResult.message,
      collected: mergedData,
      is_complete: effectiveComplete,
      conversation_status: newStatus,
    });
  } catch (error) {
    console.error('Failed to process chat:', error);
    return NextResponse.json(
      { error: 'Failed to process chat' },
      { status: 500 }
    );
  }
}
