'use client';

import { useState, useCallback } from 'react';
import type { CallMode, CommunicationMode } from '@/shared/call-types';
import { useRelayCall } from '@/hooks/useRelayCall';
import CallStatusBar from './CallStatusBar';
import LiveCaptionPanel from './LiveCaptionPanel';
import { PhoneOff, Send, Mic, MicOff, MessageSquare, Captions, Bot } from 'lucide-react';

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

const QUICK_REPLIES = [
  { label: '네', value: '네, 맞습니다' },
  { label: '아니요', value: '아니요, 그건 아닙니다' },
  { label: '잠시만요', value: '잠시만 기다려주세요' },
  { label: '다시 말해주세요', value: '다시 한번 말씀해주세요' },
];

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

  const handleSendText = useCallback((text?: string) => {
    const msg = text ?? textInput.trim();
    if (!msg) return;
    relay.sendText(msg);
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

  const isActive = relay.callStatus !== 'ended';

  // --- Voice to Voice layout ---
  const renderVoiceToVoice = () => (
    <>
      {/* Main area: speaking visualizer */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            {relay.isMuted ? (
              <>
                <div className="w-20 h-20 rounded-full bg-[#CBD5E1] flex items-center justify-center">
                  <MicOff className="size-8 text-white" />
                </div>
                <span className="text-sm text-[#94A3B8]">음소거</span>
              </>
            ) : relay.isRecording ? (
              <>
                <div className="w-20 h-20 rounded-full bg-blue-500 animate-pulse flex items-center justify-center">
                  <Mic className="size-8 text-white" />
                </div>
                <span className="text-sm text-blue-600 font-medium">발화 중...</span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <Mic className="size-5 text-white" />
                </div>
                <span className="text-sm text-[#64748B]">듣고 있어요</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom 30%: compact captions */}
        <div className="h-[30%] min-h-0 border-t border-[#E2E8F0]">
          <LiveCaptionPanel
            captions={relay.captions}
            translationState={relay.translationState}
            compact
          />
        </div>
      </div>

      {/* Audio controls: mute + end call */}
      {isActive && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[#E2E8F0]">
          <button
            onClick={relay.toggleMute}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
              relay.isMuted
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-[#F1F5F9] text-[#334155] border border-[#E2E8F0] hover:bg-[#E2E8F0]'
            }`}
          >
            {relay.isMuted ? (
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
          <button
            onClick={handleEndCall}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <PhoneOff className="size-4" />
            {'통화 종료'}
          </button>
        </div>
      )}
    </>
  );

  // --- Text to Voice layout ---
  const renderTextToVoice = () => (
    <>
      {/* Caption area: AI responses (top 60%) */}
      <div className="flex-1 min-h-0">
        <LiveCaptionPanel
          captions={relay.captions}
          translationState={relay.translationState}
        />
      </div>

      {isActive && (
        <>
          {/* Quick reply chips */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-[#E2E8F0] overflow-x-auto">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply.label}
                onClick={() => handleSendText(reply.value)}
                className="shrink-0 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#E2E8F0]"
              >
                {reply.label}
              </button>
            ))}
          </div>

          {/* Text input */}
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
              onClick={() => handleSendText()}
              disabled={!textInput.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-white transition-colors hover:bg-[#1E293B] disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>

          {/* End call */}
          <div className="px-4 py-3 border-t border-[#E2E8F0]">
            <button
              onClick={handleEndCall}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              <PhoneOff className="size-4" />
              {'통화 종료'}
            </button>
          </div>
        </>
      )}
    </>
  );

  // --- Voice to Text layout ---
  const renderVoiceToText = () => (
    <>
      {/* Full area: large captions (expanded) */}
      <div className="flex-1 min-h-0">
        <LiveCaptionPanel
          captions={relay.captions}
          translationState={relay.translationState}
          expanded
        />
      </div>

      {isActive && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[#E2E8F0]">
          {/* Mic recording status */}
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                relay.isRecording
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-teal-500'
              }`}
            />
            <span className="text-xs text-[#64748B]">
              {relay.isRecording ? '녹음 중...' : '대기 중'}
            </span>
          </div>

          <button
            onClick={handleEndCall}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <PhoneOff className="size-4" />
            {'통화 종료'}
          </button>
        </div>
      )}
    </>
  );

  // --- Full Agent layout ---
  const renderFullAgent = () => (
    <>
      {/* AI status card + captions */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* AI status card */}
        <div className="px-4 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-3 rounded-xl bg-white border border-[#E2E8F0] px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-[#0F172A] flex items-center justify-center">
              <Bot className="size-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1E293B]">AI가 대화를 진행하고 있습니다</p>
              <p className="text-xs text-[#94A3B8]">통화 내용이 아래에 실시간으로 표시됩니다</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          </div>
        </div>

        {/* Caption area: AI <-> recipient conversation */}
        <div className="flex-1 min-h-0">
          <LiveCaptionPanel
            captions={relay.captions}
            translationState={relay.translationState}
          />
        </div>
      </div>

      {isActive && (
        <>
          {/* Info message + end call */}
          <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="text-xs text-center text-[#94A3B8]">
              AI가 자율적으로 통화를 진행합니다. 사용자 개입이 필요하지 않습니다.
            </p>
          </div>
          <div className="px-4 py-3 border-t border-[#E2E8F0]">
            <button
              onClick={handleEndCall}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              <PhoneOff className="size-4" />
              {'통화 종료'}
            </button>
          </div>
        </>
      )}
    </>
  );

  // Select the right renderer based on communication mode
  const renderContent = () => {
    switch (communicationMode) {
      case 'voice_to_voice':
        return renderVoiceToVoice();
      case 'text_to_voice':
        return renderTextToVoice();
      case 'voice_to_text':
        return renderVoiceToText();
      case 'full_agent':
        return renderFullAgent();
    }
  };

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

      {/* Error display */}
      {relay.error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{relay.error}</p>
        </div>
      )}

      {/* Mode-specific content */}
      {renderContent()}
    </div>
  );
}
