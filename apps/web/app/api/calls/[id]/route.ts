// =============================================================================
// GET /api/calls/[id] - Call 상세 조회
// =============================================================================
// BE1 소유 - 단일 전화 기록 조회
// API Contract: Endpoint 3
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Call } from '@/shared/types';

// -----------------------------------------------------------------------------
// DB Row Type
// -----------------------------------------------------------------------------
interface CallRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  request_type: string;
  target_name: string | null;
  target_phone: string;
  parsed_date: string | null;
  parsed_time: string | null;
  parsed_service: string | null;
  status: string;
  result: string | null;
  summary: string | null;
  call_mode: string | null;
  relay_ws_url: string | null;
  call_id: string | null;
  call_sid: string | null;
  source_language: string | null;
  target_language: string | null;
  duration_s: number | null;
  total_tokens: number | null;
  auto_ended: boolean;
  created_at: string;
  completed_at: string | null;
}

// -----------------------------------------------------------------------------
// Helper: snake_case → camelCase 변환
// -----------------------------------------------------------------------------
function toCallResponse(row: CallRow): Call {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    requestType: row.request_type as Call['requestType'],
    targetName: row.target_name,
    targetPhone: row.target_phone,
    parsedDate: row.parsed_date,
    parsedTime: row.parsed_time,
    parsedService: row.parsed_service,
    status: row.status as Call['status'],
    result: row.result as Call['result'],
    summary: row.summary,
    callMode: row.call_mode as Call['callMode'],
    relayWsUrl: row.relay_ws_url ?? undefined,
    callId: row.call_id,
    callSid: row.call_sid,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    durationS: row.duration_s,
    totalTokens: row.total_tokens,
    autoEnded: row.auto_ended,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// -----------------------------------------------------------------------------
// GET /api/calls/[id]
// -----------------------------------------------------------------------------
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

    // 2. Call 조회
    const { data: call, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // 3. 본인 call인지 확인
    if ((call as CallRow).user_id !== user.id) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // 4. 응답
    return NextResponse.json(toCallResponse(call as CallRow));
  } catch (error) {
    console.error('Failed to get call:', error);
    return NextResponse.json(
      { error: 'Failed to get call' },
      { status: 500 }
    );
  }
}
