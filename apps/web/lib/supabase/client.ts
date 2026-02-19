// =============================================================================
// WIGVO Supabase Browser Client
// =============================================================================
// BE1 소유 - 클라이언트 컴포넌트용 Supabase 클라이언트
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Demo mode: use placeholder values to prevent crash
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
  return createBrowserClient(url, key);
}
