// =============================================================================
// POST /api/conversations - 대화 시작
// GET /api/conversations - 대화 목록 조회
// =============================================================================
// BE1 소유 - 새 대화 세션 생성 및 목록 조회
// API Contract: Endpoint 0-1
// v4: 시나리오 타입 파라미터 지원
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createConversation } from '@/lib/supabase/chat';
import type { CollectedData, ScenarioType, ScenarioSubType } from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';

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

    // 2. v5: 모드 + 시나리오 타입 + 언어 파라미터 파싱
    let scenarioType: ScenarioType | undefined;
    let subType: ScenarioSubType | undefined;
    let communicationMode: CommunicationMode | undefined;
    let sourceLang: string | undefined;
    let targetLang: string | undefined;

    try {
      const body = await request.json();
      scenarioType = body.scenarioType;
      subType = body.subType;
      communicationMode = body.communicationMode;
      sourceLang = body.sourceLang;
      targetLang = body.targetLang;
    } catch {
      // body가 없거나 파싱 실패해도 OK (기존 호환성)
    }

    // 3. 대화 세션 생성 (모드 + 시나리오 타입 + 언어 전달)
    const { conversation, greeting } = await createConversation(
      user.id,
      scenarioType,
      subType,
      communicationMode,
      sourceLang,
      targetLang
    );

    // 4. 응답 (snake_case → camelCase 변환)
    return NextResponse.json(
      {
        id: conversation.id,
        userId: conversation.user_id,
        status: conversation.status,
        collectedData: conversation.collected_data,
        greeting,
        createdAt: conversation.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function GET() {
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

    // 2. 대화 목록 조회 (최근 20개)
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        status,
        collected_data,
        created_at,
        messages (
          content,
          role,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Failed to fetch conversations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }

    // 3. 응답 변환 (사이드바용 요약 형태)
    const summaries = (conversations || []).map((conv) => {
      const collectedData = conv.collected_data as CollectedData | null;
      const messages = conv.messages as Array<{ content: string; role: string; created_at: string }> | null;
      
      // 마지막 메시지 찾기 (정렬 후)
      const sortedMessages = (messages || []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastMessage = sortedMessages[0];

      return {
        id: conv.id,
        status: conv.status,
        targetName: collectedData?.target_name || null,
        lastMessage: lastMessage?.content?.slice(0, 50) || '새 대화',
        createdAt: conv.created_at,
      };
    });

    return NextResponse.json({ conversations: summaries });
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
