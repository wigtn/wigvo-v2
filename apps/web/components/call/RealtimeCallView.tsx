'use client';

import { useState, useCallback, useMemo } from 'react';
import type { CallMode, CommunicationMode } from '@/shared/call-types';
import { getModeUIConfig } from '@/shared/call-types';
import { useRelayCall } from '@/hooks/useRelayCall';
import CallStatusBar from './CallStatusBar';
import LiveCaptionPanel from './LiveCaptionPanel';
import AudioControls from './AudioControls';
import { PhoneOff, Send, Mic, MessageSquare, Captions, Bot } from 'lucide-react';

interface RealtimeCallViewProps {
  callId: string;
  relayWsUrl: string;
  callMode: CallMode;
  communicationMode?: CommunicationMode;
  targetName?: string | null;
  onCallEnd?: () => void;
}

const modeBadgeConfig: Record<CommunicationMode, { icon: typeof Mic; label: string }> = {
  voice_to_voice: { icon: Mic, label: '양방향 음성 번역' },
  text_to_voice: { icon: MessageSquare, label: '텍스트 → 음성' },
  voice_to_text: { icon: Captions, label: '음성 → 자막' },
  full_agent: { icon: Bot, label: 'AI 자율 통화' },
};

export default function RealtimeCallView({
  callId,
  relayWsUrl,
  callMode,
  communicationMode = 'voice_to_voice',
  targetName,
  onCallEnd,
}: RealtimeCallViewProps) {
  const relay = useRelayCall(communicationMode);
  const [textInput, setTextInput] = useState('');

  const config = useMemo(() => getModeUIConfig(communicationMode), [communicationMode]);
  const badge = modeBadgeConfig[communicationMode];
  const BadgeIcon = badge.icon;

  // Start the call on mount
  const startedRef = useState(() => {
    relay.startCall(callId, relayWsUrl, callMode);
    return true;
  })[0];
  void startedRef;

  const handleEndCall = useCallback(() => {
    relay.endCall();
    onCallEnd?.();
  }, [relay, onCallEnd]);

  const handleSendText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    relay.sendText(text);
    setTextInput('');
  }, [textInput, relay]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendText();
      }
    },
    [handleSendText],
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Status Bar */}
      <CallStatusBar
        callStatus={relay.callStatus}
        callDuration={relay.callDuration}
        targetName={targetName}
        callMode={callMode}
      />

      {/* Mode Badge */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <BadgeIcon className="size-3 text-[#64748B]" />
        <span className="text-[10px] font-medium text-[#64748B]">{badge.label}</span>
      </div>

      {/* Captions */}
      <div className="flex-1 min-h-0">
        <LiveCaptionPanel
          captions={relay.captions}
          translationState={relay.translationState}
          expanded={config.captionOnly}
        />
      </div>

      {/* Error display */}
      {relay.error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{relay.error}</p>
        </div>
      )}

      {/* Audio Controls - only if audioInput is enabled */}
      {config.audioInput && relay.callStatus !== 'ended' && (
        <AudioControls
          isMuted={relay.isMuted}
          isSpeaking={relay.isRecording}
          onToggleMute={relay.toggleMute}
          communicationMode={communicationMode}
        />
      )}

      {/* Text Input - only if textInput is enabled */}
      {config.textInput && relay.callStatus !== 'ended' && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#E2E8F0]">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'직접 메시지 전달...'}
            className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm text-[#334155] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-1 focus:ring-[#0F172A]"
          />
          <button
            onClick={handleSendText}
            disabled={!textInput.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-white transition-colors hover:bg-[#1E293B] disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      )}

      {/* End Call Button */}
      {relay.callStatus !== 'ended' && (
        <div className="px-4 py-3 border-t border-[#E2E8F0]">
          <button
            onClick={handleEndCall}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <PhoneOff className="size-4" />
            {'통화 종료'}
          </button>
        </div>
      )}
    </div>
  );
}
