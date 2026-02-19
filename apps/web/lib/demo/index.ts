// =============================================================================
// Demo Mode — Entry Point
// =============================================================================
// NEXT_PUBLIC_DEMO_MODE=true 로 활성화
// 화면 녹화용 Mock 데이터로 전체 플로우 시연
// =============================================================================

export function isDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    // Client-side: check window or env
    return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  }
  // Server-side
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export { MOCK_WS_URL_PREFIX } from './mock-ws';
