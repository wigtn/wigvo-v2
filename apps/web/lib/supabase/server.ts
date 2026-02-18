// =============================================================================
// WIGVO Supabase Server Client
// =============================================================================
// BE1 소유 - API Route, Server Component용 Supabase 클라이언트
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Server Component에서 호출 시 에러 발생 가능 - 로깅 후 계속 진행
            console.warn('[Supabase] Failed to set cookies (expected in Server Component):', error);
          }
        },
      },
    }
  );
}
