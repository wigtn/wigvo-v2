'use client';

import { Mic, MicOff, Captions } from 'lucide-react';
import type { CommunicationMode } from '@/shared/call-types';

interface AudioControlsProps {
  isMuted: boolean;
  isSpeaking: boolean;
  onToggleMute: () => void;
  communicationMode?: CommunicationMode;
}

export default function AudioControls({
  isMuted,
  isSpeaking,
  onToggleMute,
  communicationMode,
}: AudioControlsProps) {
  // voice_to_text 모드: 자막 전용 모드 뱃지 표시
  if (communicationMode === 'voice_to_text') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[#E2E8F0]">
        <div className="flex items-center gap-2 flex-1">
          <Captions className="size-4 text-[#64748B]" />
          <span className="text-xs font-medium text-[#64748B]">
            {'자막 전용 모드'}
          </span>
        </div>
        <div className="rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] px-3 py-1.5">
          <span className="text-[10px] text-[#94A3B8]">{'음성은 녹음되지만 재생되지 않습니다'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-[#E2E8F0]">
      {/* VAD indicator */}
      <div className="flex items-center gap-2 flex-1">
        <div
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            isMuted
              ? 'bg-[#CBD5E1]'
              : isSpeaking
                ? 'bg-blue-500 animate-pulse'
                : 'bg-teal-500'
          }`}
        />
        <span className="text-xs text-[#64748B]">
          {isMuted
            ? '음소거 켜짐'
            : isSpeaking
              ? '발화 중...'
              : '듣고 있어요'}
        </span>
      </div>

      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
          isMuted
            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
            : 'bg-[#F1F5F9] text-[#334155] border border-[#E2E8F0] hover:bg-[#E2E8F0]'
        }`}
      >
        {isMuted ? (
          <>
            <MicOff className="size-3.5" />
            {'음소거 해제'}
          </>
        ) : (
          <>
            <Mic className="size-3.5" />
            {'음소거'}
          </>
        )}
      </button>
    </div>
  );
}
