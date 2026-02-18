'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Call, CallStatus } from '@/shared/types';

// Terminal states that stop polling
const TERMINAL_STATUSES: CallStatus[] = ['COMPLETED', 'FAILED'];

interface UseCallPollingReturn {
  call: Call | null;
  loading: boolean;
  error: string | null;
}

export function useCallPolling(callId: string): UseCallPollingReturn {
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const retryCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTerminalRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchCall = useCallback(async () => {
    if (isTerminalRef.current) return;

    try {
      const res = await fetch(`/api/calls/${callId}`);

      if (res.status === 401) {
        stopPolling();
        router.push('/login');
        return;
      }

      if (res.status === 404) {
        stopPolling();
        router.push('/');
        return;
      }

      if (!res.ok) {
        retryCountRef.current += 1;
        if (retryCountRef.current >= 3) {
          stopPolling();
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

      // Stop polling on terminal status
      if (TERMINAL_STATUSES.includes(data.status)) {
        isTerminalRef.current = true;
        stopPolling();
      }
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current >= 3) {
        stopPolling();
        setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
        setLoading(false);
      }
    }
  }, [callId, router, stopPolling]);

  useEffect(() => {
    // Reset state
    isTerminalRef.current = false;
    retryCountRef.current = 0;
    setLoading(true);
    setError(null);
    setCall(null);

    // Immediate first fetch
    fetchCall();

    // Poll every 3 seconds
    intervalRef.current = setInterval(fetchCall, 3000);

    return () => {
      stopPolling();
    };
  }, [fetchCall, stopPolling]);

  return { call, loading, error };
}
