// =============================================================================
// GET /api/conversations/[id] - 대화 복구
// =============================================================================
// BE1 소유 - 대화 세션 + 메시지 조회
// API Contract: Endpoint 0-3
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getConversation } from '@/lib/supabase/chat';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15+: params는 Promise이므로 await 필수
    const { id } = await params;

    // 1. 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 대화 조회
    const conversation = await getConversation(id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 3. 본인 대화인지 확인
    if (conversation.user_id !== user.id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 4. CALLING 상태인데 통화가 이미 끝났으면 COMPLETED로 보정
    let effectiveStatus = conversation.status;
    if (conversation.status === 'CALLING') {
      const { data: calls } = await supabase
        .from('calls')
        .select('status')
        .eq('conversation_id', id)
        .limit(1);
      const call = calls?.[0];
      if (call && (call.status === 'COMPLETED' || call.status === 'FAILED')) {
        effectiveStatus = 'COMPLETED';
      }
    }

    // 5. 응답 (snake_case → camelCase 변환)
    return NextResponse.json({
      id: conversation.id,
      userId: conversation.user_id,
      status: effectiveStatus,
      collectedData: conversation.collected_data,
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
      })),
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    });
  } catch (error) {
    console.error('Failed to get conversation:', error);
    return NextResponse.json(
      { error: 'Failed to get conversation' },
      { status: 500 }
    );
  }
}
