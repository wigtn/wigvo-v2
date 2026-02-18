'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCall } from '@/lib/api';
import type { Call } from '@/shared/types';
import type { CallMode } from '@/shared/call-types';
import RealtimeCallView from '@/components/call/RealtimeCallView';
import ResultCard from '@/components/call/ResultCard';
import { Loader2 } from 'lucide-react';

export default function CallPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params.callId as string;

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  useEffect(() => {
    if (!callId) return;

    async function fetchCall() {
      try {
        const data = await getCall(callId);
        setCall(data as unknown as Call);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load call');
      } finally {
        setLoading(false);
      }
    }

    fetchCall();
  }, [callId]);

  const handleCallEnd = () => {
    setCallEnded(true);
    // Refresh call data to get the result
    getCall(callId)
      .then((data) => setCall(data as unknown as Call))
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 text-[#0F172A] animate-spin" />
          <p className="text-sm text-[#94A3B8]">{'\uD1B5\uD654 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...'}</p>
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F8FAFC]">
        <div className="text-center px-6">
          <p className="text-sm text-red-500 mb-2">{error ?? '\uD1B5\uD654\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4'}</p>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-[#64748B] hover:text-[#334155] underline"
          >
            {'\uD648\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30'}
          </button>
        </div>
      </div>
    );
  }

  // If call is already completed/failed, show result
  const isTerminal = call.status === 'COMPLETED' || call.status === 'FAILED';
  if (isTerminal || callEnded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <div className="w-full max-w-md px-4 py-8">
          <ResultCard call={call} />
        </div>
      </div>
    );
  }

  // Active call with relay WS URL
  if (!call.relayWsUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F8FAFC]">
        <div className="text-center px-6">
          <p className="text-sm text-[#94A3B8]">{'\uD1B5\uD654 \uC5F0\uACB0 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4'}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-2 text-sm text-[#64748B] hover:text-[#334155] underline"
          >
            {'\uD648\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md h-[80vh]">
        <RealtimeCallView
          callId={callId}
          relayWsUrl={call.relayWsUrl}
          callMode={(call.callMode as CallMode) ?? 'agent'}
          targetName={call.targetName}
          onCallEnd={handleCallEnd}
        />
      </div>
    </div>
  );
}
