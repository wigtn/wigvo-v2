// =============================================================================
// WIGVO Supabase Middleware Client
// =============================================================================
// BE1 소유 - Middleware용 Supabase 세션 갱신
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 - getUser()를 호출해야 세션이 갱신됨
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미인증 사용자 처리
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isTestPage = request.nextUrl.pathname.startsWith('/test-map');

  // API Route는 각 핸들러에서 인증 처리
  if (isApiRoute) {
    return supabaseResponse;
  }

  // 인증 콜백은 통과
  if (isAuthCallback) {
    return supabaseResponse;
  }

  // 테스트 페이지는 인증 없이 접근 허용
  if (isTestPage) {
    return supabaseResponse;
  }

  // 미인증 + 로그인 페이지 아님 → /login으로 redirect
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 인증됨 + 로그인 페이지 → /로 redirect
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
