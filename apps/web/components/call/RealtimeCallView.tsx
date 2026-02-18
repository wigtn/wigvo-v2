'use client';

import { useState, useCallback } from 'react';
import type { CallMode } from '@/shared/call-types';
import { useRelayCall } from '@/hooks/useRelayCall';
import CallStatusBar from './CallStatusBar';
import LiveCaptionPanel from './LiveCaptionPanel';
import AudioControls from './AudioControls';
import { PhoneOff, Send } from 'lucide-react';

interface RealtimeCallViewProps {
  callId: string;
  relayWsUrl: string;
  callMode: CallMode;
  targetName?: string | null;
  onCallEnd?: () => void;
}

export default function RealtimeCallView({
  callId,
  relayWsUrl,
  callMode,
  targetName,
  onCallEnd,
}: RealtimeCallViewProps) {
  const relay = useRelayCall();
  const [textInput, setTextInput] = useState('');

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

      {/* Captions */}
      <div className="flex-1 min-h-0">
        <LiveCaptionPanel
          captions={relay.captions}
          translationState={relay.translationState}
        />
      </div>

      {/* Error display */}
      {relay.error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{relay.error}</p>
        </div>
      )}

      {/* Audio Controls (Relay Mode only) */}
      {callMode === 'relay' && relay.callStatus !== 'ended' && (
        <AudioControls
          isMuted={relay.isMuted}
          isSpeaking={relay.isRecording}
          onToggleMute={relay.toggleMute}
        />
      )}

      {/* Text Input (Agent Mode) */}
      {callMode === 'agent' && relay.callStatus !== 'ended' && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#E2E8F0]">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'\uC9C1\uC811 \uBA54\uC2DC\uC9C0 \uC804\uB2EC...'}
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
            {'\uD1B5\uD654 \uC885\uB8CC'}
          </button>
        </div>
      )}
    </div>
  );
}
