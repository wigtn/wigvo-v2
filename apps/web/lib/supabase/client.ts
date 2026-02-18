// =============================================================================
// WIGVO Supabase Browser Client
// =============================================================================
// BE1 소유 - 클라이언트 컴포넌트용 Supabase 클라이언트
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
