'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WsMessageType,
  getModeUIConfig,
  type CallMode,
  type CaptionEntry,
  type CommunicationMode,
  type RelayWsMessage,
} from '@/shared/call-types';
import { useRelayWebSocket } from './useRelayWebSocket';
import { useClientVad } from './useClientVad';
import { useWebAudioPlayer } from './useWebAudioPlayer';

type CallStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'ended';
type TranslationState = 'idle' | 'processing' | 'done';

interface UseRelayCallReturn {
  callStatus: CallStatus;
  translationState: TranslationState;
  captions: CaptionEntry[];
  callDuration: number;
  callMode: CallMode;
  startCall: (callId: string, relayWsUrl: string, mode: CallMode) => void;
  endCall: () => void;
  sendText: (text: string) => void;
  toggleMute: () => void;
  isMuted: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  error: string | null;
}

export function useRelayCall(communicationMode: CommunicationMode = 'voice_to_voice'): UseRelayCallReturn {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [translationState, setTranslationState] = useState<TranslationState>('idle');
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [callMode, setCallMode] = useState<CallMode>('agent');
  const [isMuted, setIsMuted] = useState(false);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userSpeakingRef = useRef(false);
  const wsRef = useRef<{ disconnect: () => void } | null>(null);

  // Mode UI config
  const modeConfig = getModeUIConfig(communicationMode);

  // Audio player
  const player = useWebAudioPlayer();

  // Caption counter for unique IDs
  const captionCounterRef = useRef(0);

  // Track current streaming caption for delta accumulation
  // Streaming deltas from the same speaker/direction/stage are merged into one caption
  const streamingRef = useRef<{
    direction: string;
    stage: number | undefined;
    speaker: string;
  } | null>(null);

  // Handle incoming WS messages
  const handleMessage = useCallback(
    (msg: RelayWsMessage) => {
      switch (msg.type) {
        case WsMessageType.CAPTION:
        case WsMessageType.CAPTION_ORIGINAL:
        case WsMessageType.CAPTION_TRANSLATED: {
          const stage = msg.type === WsMessageType.CAPTION_ORIGINAL ? 1
            : msg.type === WsMessageType.CAPTION_TRANSLATED ? 2
            : (msg.data.stage as 1 | 2 | undefined);

          const direction = (msg.data.direction as string) ?? 'unknown';
          // Server sends "role", client uses "speaker" — support both
          const speaker = (msg.data.role as CaptionEntry['speaker'])
            ?? (msg.data.speaker as CaptionEntry['speaker'])
            ?? 'recipient';
          const text = (msg.data.text as string) ?? '';

          const cur = streamingRef.current;

          // Append to existing caption if same speaker + direction + stage
          if (cur &&
              cur.direction === direction &&
              cur.stage === stage &&
              cur.speaker === speaker) {
            setCaptions((prev) => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, text: last.text + text };
              return updated;
            });
          } else {
            // New caption entry
            captionCounterRef.current += 1;
            const entry: CaptionEntry = {
              id: `caption-${captionCounterRef.current}`,
              speaker,
              text,
              language: (msg.data.language as string) ?? '',
              isFinal: false,
              timestamp: Date.now(),
              stage,
            };
            setCaptions((prev) => [...prev, entry]);
            streamingRef.current = { direction, stage, speaker };
          }
          break;
        }

        case WsMessageType.RECIPIENT_AUDIO: {
          // voice_to_text 모드: 수신자 음성은 재생하지 않음 (자막만 표시)
          if (!modeConfig.audioOutput) break;
          const audio = msg.data.audio as string;
          if (audio) {
            player.play(audio);
          }
          break;
        }

        case WsMessageType.CALL_STATUS: {
          const status = (msg.data.status as string) ?? (msg.data.message as string);
          if (status === 'ringing' || status === 'waiting') {
            setCallStatus('waiting');
          } else if (status === 'connected' || status === 'in-progress') {
            setCallStatus('connected');
          } else if (status === 'ended' || status === 'completed' || status === 'failed') {
            setCallStatus('ended');
            // Server confirmed call ended — clean up resources
            player.stop();
            if (durationTimerRef.current) {
              clearInterval(durationTimerRef.current);
              durationTimerRef.current = null;
            }
            // Delay disconnect so any final messages can arrive
            setTimeout(() => {
              wsRef.current?.disconnect();
              setWsUrl(null);
            }, 300);
          }
          break;
        }

        case WsMessageType.TRANSLATION_STATE: {
          const state = msg.data.state as TranslationState;
          if (state) setTranslationState(state);
          break;
        }

        case WsMessageType.INTERRUPT_ALERT: {
          // Clear playback queue when recipient is speaking
          player.clearQueue();
          break;
        }

        case WsMessageType.ERROR: {
          const message = (msg.data.message as string) ?? 'Unknown error';
          setError(message);
          break;
        }

        default:
          break;
      }
    },
    [player, modeConfig.audioOutput],
  );

  // WebSocket connection
  const ws = useRelayWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    autoConnect: true,
  });
  wsRef.current = ws;

  // Update callStatus when ws connects
  useEffect(() => {
    if (ws.status === 'connected' && callStatus === 'connecting') {
      setCallStatus('waiting');
    } else if (ws.status === 'error') {
      setError('WebSocket connection failed');
    }
  }, [ws.status, callStatus]);

  // Client VAD — active only when audioInput is enabled and not muted
  const vadEnabled = modeConfig.audioInput && !isMuted && wsUrl !== null && ws.status === 'connected';

  const { isSpeaking } = useClientVad({
    onSpeechAudio: (base64Audio: string) => {
      if (!userSpeakingRef.current) {
        userSpeakingRef.current = true;
        player.stop();
      }
      ws.sendAudioChunk(base64Audio);
    },
    onSpeechCommitted: () => {
      userSpeakingRef.current = false;
      ws.sendVadState('committed');
    },
    enabled: vadEnabled,
  });

  // Call duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [callStatus]);

  const startCall = useCallback(
    (callId: string, relayWsUrl: string, mode: CallMode) => {
      setCallMode(mode);
      setCallStatus('connecting');
      setCaptions([]);
      setCallDuration(0);
      setError(null);
      setTranslationState('idle');
      setIsMuted(false);
      captionCounterRef.current = 0;
      streamingRef.current = null;
      setWsUrl(relayWsUrl);
    },
    [],
  );

  const endCall = useCallback(() => {
    // Send END_CALL first, then wait briefly before disconnecting
    // to ensure the message is delivered to the relay server.
    const sent = ws.sendEndCall();
    player.stop();
    setCallStatus('ended');

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (sent) {
      // Give the server time to receive END_CALL and process Twilio hangup
      setTimeout(() => {
        ws.disconnect();
        setWsUrl(null);
      }, 500);
    } else {
      // WebSocket was not open — disconnect immediately
      ws.disconnect();
      setWsUrl(null);
    }
  }, [ws, player]);

  const sendText = useCallback(
    (text: string) => {
      ws.sendText(text);
      // Add local caption immediately so the user sees their text in the chat
      captionCounterRef.current += 1;
      const entry: CaptionEntry = {
        id: `caption-${captionCounterRef.current}`,
        speaker: 'user',
        text,
        language: '',
        isFinal: true,
        timestamp: Date.now(),
      };
      setCaptions((prev) => [...prev, entry]);
      streamingRef.current = null;
    },
    [ws],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, []);

  return {
    callStatus,
    translationState,
    captions,
    callDuration,
    callMode,
    startCall,
    endCall,
    sendText,
    toggleMute,
    isMuted,
    isRecording: vadEnabled && isSpeaking,
    isPlaying: player.isPlaying,
    error,
  };
}
