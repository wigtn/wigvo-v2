// =============================================================================
// GET /api/calls/[id] - Call 상세 조회
// =============================================================================
// BE1 소유 - 단일 전화 기록 조회
// API Contract: Endpoint 3
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CallRow } from '@/shared/types';
import { toCallResponse } from '@/lib/supabase/helpers';

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
