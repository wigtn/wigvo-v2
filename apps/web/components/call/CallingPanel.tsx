'use client';

import { useState, useEffect, useRef } from 'react';
import { useCallPolling } from '@/hooks/useCallPolling';
import { type Call } from '@/shared/types';
import { useDashboard } from '@/hooks/useDashboard';
import CallingStatus from './CallingStatus';
import ResultCard from './ResultCard';
import RealtimeCallView from './RealtimeCallView';
import { Loader2, X } from 'lucide-react';
import type { CallMode } from '@/shared/call-types';

const TEST_CALL_ID = '__test__';

/**
 * CallingPanel - 대시보드 오른쪽에 맵 대신 표시되는 통화 패널
 * useCallPolling으로 내부 폴링하며, 통화 중 → 결과 표시를 인라인으로 처리
 *
 * callMode가 'agent' 또는 'relay'이고 relayWsUrl이 있으면 RealtimeCallView를 표시.
 * 그 외(레거시 ElevenLabs)는 기존 폴링 UI를 유지.
 */
export default function CallingPanel() {
  const { callingCallId, resetCalling } = useDashboard();
  const isTestMode = callingCallId === TEST_CALL_ID;
  const { call, loading, error } = useCallPolling(isTestMode ? '' : (callingCallId ?? ''));
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTerminalRef = useRef(false);
  const [realtimeCallEnded, setRealtimeCallEnded] = useState(false);

  // 테스트 모드용 mock call
  const testCall: Call = {
    id: TEST_CALL_ID,
    userId: 'test',
    conversationId: null,
    requestType: 'RESERVATION',
    targetName: 'OO미용실',
    targetPhone: '010-1234-5678',
    parsedDate: null,
    parsedTime: null,
    parsedService: null,
    status: 'IN_PROGRESS',
    result: null,
    summary: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const activeCall = isTestMode ? testCall : call;

  // Relay/Agent 모드 판별
  const isRealtimeMode =
    activeCall?.callMode === 'agent' || activeCall?.callMode === 'relay';
  const hasRelayWsUrl = !!activeCall?.relayWsUrl;

  // 경과 시간 카운터 (레거시 폴링 모드에서만 사용)
  useEffect(() => {
    if (isRealtimeMode && hasRelayWsUrl) return; // RealtimeCallView가 자체 타이머 사용

    setElapsed(0);
    isTerminalRef.current = false;

    timerRef.current = setInterval(() => {
      if (!isTerminalRef.current) {
        setElapsed((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callingCallId, isRealtimeMode, hasRelayWsUrl]);

  // Reset realtimeCallEnded when call changes
  useEffect(() => {
    setRealtimeCallEnded(false);
  }, [callingCallId]);

  // 종료 상태 감지
  useEffect(() => {
    if (!activeCall) return;
    const isTerminal = activeCall.status === 'COMPLETED' || activeCall.status === 'FAILED';
    if (isTerminal) {
      isTerminalRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [activeCall]);

  const isTerminal = activeCall?.status === 'COMPLETED' || activeCall?.status === 'FAILED';

  // 테스트 모드
  if (isTestMode) {
    return (
      <div className="relative flex items-center justify-center h-full">
        <button
          onClick={() => resetCalling()}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
          title="테스트 종료"
        >
          <X className="size-4 text-[#64748B]" />
        </button>
        <CallingStatus call={testCall} elapsed={elapsed} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center px-6">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-[#64748B] hover:text-[#334155] underline"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (loading && !call) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-6 text-[#0F172A] animate-spin" />
        <p className="text-sm text-[#94A3B8]">통화 정보를 불러오는 중...</p>
      </div>
    );
  }

  // 통화 완료/실패 → 결과 카드
  if ((isTerminal || realtimeCallEnded) && activeCall) {
    return (
      <div className="h-full overflow-y-auto styled-scrollbar px-4 py-6">
        <ResultCard call={activeCall} />
      </div>
    );
  }

  // Realtime Mode (Agent/Relay) with relay WS URL → RealtimeCallView
  if (isRealtimeMode && hasRelayWsUrl && activeCall) {
    return (
      <div className="h-full p-2">
        <RealtimeCallView
          callId={activeCall.id}
          relayWsUrl={activeCall.relayWsUrl!}
          callMode={activeCall.callMode as CallMode}
          targetName={activeCall.targetName}
          onCallEnd={() => setRealtimeCallEnded(true)}
        />
      </div>
    );
  }

  // 레거시 폴링 모드 (ElevenLabs 또는 relayWsUrl 없음) → CallingStatus (Orb 포함)
  return (
    <div className="flex items-center justify-center h-full">
      <CallingStatus call={activeCall} elapsed={elapsed} />
    </div>
  );
}
