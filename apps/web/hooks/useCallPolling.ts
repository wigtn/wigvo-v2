'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Call, CallStatus } from '@/shared/types';
import { isDemoMode } from '@/lib/demo';
import { DEMO_CALL, DEMO_CALL_RESULT, DEMO_CALL_START_RESPONSE } from '@/lib/demo/mock-data';

// Terminal states that stop further fetches
const TERMINAL_STATUSES: CallStatus[] = ['COMPLETED', 'FAILED'];

interface UseCallPollingReturn {
  call: Call | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Call 메타데이터를 가져오는 훅.
 *
 * 기존: 3초마다 폴링 → Auth 요청 폭발 (3초 × 2건 = 60분에 2,400건)
 * 변경: 초기 1회 fetch + manual refetch (통화 종료 시)
 *
 * 실시간 통화 상태는 WebSocket(useRelayCallStore)이 담당하므로
 * 연속 폴링이 불필요함.
 */
export function useCallPolling(callId: string): UseCallPollingReturn {
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const retryCountRef = useRef(0);
  const fetchedRef = useRef(false);
  // Demo mode: track whether refetch has been called (= call ended)
  const demoRefetchedRef = useRef(false);

  const fetchCall = useCallback(async () => {
    if (!callId) return;

    // --- Demo Mode: return mock data without network call ---
    if (isDemoMode()) {
      if (demoRefetchedRef.current) {
        // After refetch (call ended) → return completed result
        setCall({ ...DEMO_CALL_RESULT, id: callId });
      } else {
        // Initial fetch → return IN_PROGRESS with relayWsUrl
        setCall({
          ...DEMO_CALL,
          id: callId,
          status: 'IN_PROGRESS',
          relayWsUrl: DEMO_CALL_START_RESPONSE.relayWsUrl,
        });
      }
      setLoading(false);
      setError(null);
      return;
    }

    try {
      const res = await fetch(`/api/calls/${callId}`);

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (res.status === 404) {
        router.push('/');
        return;
      }

      if (!res.ok) {
        retryCountRef.current += 1;
        if (retryCountRef.current >= 3) {
          setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
          setLoading(false);
        }
        return;
      }

      const data: Call = await res.json();
      setCall(data);
      setLoading(false);
      setError(null);
      retryCountRef.current = 0;
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current >= 3) {
        setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
        setLoading(false);
      }
    }
  }, [callId, router]);

  // Initial fetch (1회만)
  useEffect(() => {
    if (!callId) return;

    fetchedRef.current = false;
    retryCountRef.current = 0;
    demoRefetchedRef.current = false;
    setLoading(true);
    setError(null);
    setCall(null);

    fetchCall().then(() => {
      fetchedRef.current = true;
    });
  }, [callId, fetchCall]);

  // Manual refetch (통화 종료 시 ResultCard용 최신 데이터)
  const refetch = useCallback(() => {
    if (isDemoMode()) {
      demoRefetchedRef.current = true;
    }
    fetchCall();
  }, [fetchCall]);

  return { call, loading, error, refetch };
}
