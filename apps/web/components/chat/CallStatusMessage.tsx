'use client';

import { Phone, PhoneOff, Loader2 } from 'lucide-react';

interface CallStatusMessageProps {
  type: 'connecting' | 'connected' | 'ended';
  targetName?: string | null;
  duration?: string;
}

export default function CallStatusMessage({ type, targetName, duration }: CallStatusMessageProps) {
  return (
    <div className="flex justify-center my-4">
      <div className="inline-flex items-center gap-2 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] px-4 py-2">
        {type === 'connecting' && (
          <>
            <Loader2 className="size-3.5 text-[#64748B] animate-spin" />
            <span className="text-xs text-[#64748B]">
              {targetName ? `${targetName}에 전화 연결 중...` : '전화 연결 중...'}
            </span>
          </>
        )}
        {type === 'connected' && (
          <>
            <Phone className="size-3.5 text-teal-600" />
            <span className="text-xs text-teal-600 font-medium">통화 연결됨</span>
          </>
        )}
        {type === 'ended' && (
          <>
            <PhoneOff className="size-3.5 text-[#94A3B8]" />
            <span className="text-xs text-[#94A3B8]">
              통화 종료{duration ? ` — ${duration}` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
