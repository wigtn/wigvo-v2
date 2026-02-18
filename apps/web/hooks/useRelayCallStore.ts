'use client';

import { create } from 'zustand';
import type { CallMode, CaptionEntry, CommunicationMode } from '@/shared/call-types';

type CallStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'ended';
type TranslationState = 'idle' | 'processing' | 'done';

interface RelayCallStoreState {
  // 상태 (RelayCallProvider가 동기화)
  callStatus: CallStatus;
  translationState: TranslationState;
  captions: CaptionEntry[];
  callDuration: number;
  callMode: CallMode;
  isMuted: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  error: string | null;

  // 액션 (Provider가 주입)
  startCall: ((callId: string, relayWsUrl: string, mode: CallMode) => void) | null;
  endCall: (() => void) | null;
  sendText: ((text: string) => void) | null;
  toggleMute: (() => void) | null;

  // 동기화
  syncState: (partial: Partial<RelayCallStoreState>) => void;
  reset: () => void;
}

const initialState = {
  callStatus: 'idle' as CallStatus,
  translationState: 'idle' as TranslationState,
  captions: [] as CaptionEntry[],
  callDuration: 0,
  callMode: 'agent' as CallMode,
  isMuted: false,
  isRecording: false,
  isPlaying: false,
  error: null as string | null,
  startCall: null as RelayCallStoreState['startCall'],
  endCall: null as RelayCallStoreState['endCall'],
  sendText: null as RelayCallStoreState['sendText'],
  toggleMute: null as RelayCallStoreState['toggleMute'],
};

export const useRelayCallStore = create<RelayCallStoreState>((set) => ({
  ...initialState,

  syncState: (partial) => set(partial),

  reset: () => set(initialState),
}));
