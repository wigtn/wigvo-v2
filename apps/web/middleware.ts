// =============================================================================
// WIGVO Middleware
// =============================================================================
// BE1 소유 - Supabase 세션 갱신 + 인증 보호
// =============================================================================

import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// 레거시 Cloud Run URL → 새 URL 리다이렉트
const CANONICAL_HOST = process.env.CANONICAL_HOST;
const LEGACY_HOST = process.env.LEGACY_HOST;

export async function middleware(request: NextRequest) {
  // 레거시 도메인 접속 시 새 도메인으로 301 리다이렉트
  const host = request.headers.get('host') || '';
  if (CANONICAL_HOST && LEGACY_HOST && host.startsWith(LEGACY_HOST)) {
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(
      `https://${CANONICAL_HOST}${pathname}${search}`,
      301,
    );
  }

  // Demo mode: skip Supabase auth
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
