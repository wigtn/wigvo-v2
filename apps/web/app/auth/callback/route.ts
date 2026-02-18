// =============================================================================
// GET /auth/callback - Supabase OAuth 콜백
// =============================================================================
// BE1 소유 - OAuth 인증 후 세션 교환
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 인증 성공 → 원래 가려던 페이지로 redirect
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 인증 실패 → 에러 페이지로 redirect
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
