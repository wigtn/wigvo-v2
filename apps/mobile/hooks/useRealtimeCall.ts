import { useCallback, useEffect, useState } from 'react';
import { useRelayWebSocket } from './useRelayWebSocket';
import { useClientVad } from './useClientVad';
import * as Haptics from 'expo-haptics';

type Language = 'en' | 'ko';
type CallMode = 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text';

interface UseRealtimeCallOptions {
  callId: string;
  relayWsUrl: string;
  callMode: CallMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  onCallEnd?: () => void;
}

export function useRealtimeCall(options: UseRealtimeCallOptions) {
  const { callId, relayWsUrl, callMode, sourceLanguage, targetLanguage, onCallEnd } = options;

  const [isRecipientSpeaking, setIsRecipientSpeaking] = useState(false);

  // WebSocket connection
  const ws = useRelayWebSocket({
    callId,
    relayWsUrl,
    onCallStatusChange: (status) => {
      if (status === 'completed' || status === 'failed' || status === 'no_answer') {
        vad.stopRecording();
        onCallEnd?.();
      }
    },
    onError: (code, message) => {
      console.error(`[RealtimeCall] Error ${code}: ${message}`);
    },
    onWarning: (message) => {
      console.warn(`[RealtimeCall] Warning: ${message}`);
    },
    onInterrupt: (source) => {
      if (source === 'recipient') {
        setIsRecipientSpeaking(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTimeout(() => setIsRecipientSpeaking(false), 2000);
      }
    },
  });

  // Client-side VAD (only for voice-to-voice mode)
  const isVoiceMode = callMode === 'voice-to-voice';

  const vad = useClientVad({
    enabled: isVoiceMode,
    onAudioChunk: (pcm16Base64) => {
      ws.sendAudioChunk(pcm16Base64);
    },
    onCommit: () => {
      ws.commitAudio();
    },
    onSpeechStart: () => {
      // Notify server that user started speaking
    },
    onSpeechEnd: () => {
      // Notify server that user stopped speaking
    },
  });

  // Connect and start recording when ready
  useEffect(() => {
    ws.connect();
    return () => {
      ws.disconnect();
      vad.stopRecording();
    };
  }, []);

  // Auto-start recording when call becomes active (voice mode)
  useEffect(() => {
    if (isVoiceMode && ws.callStatus === 'active' && !vad.isRecording) {
      vad.startRecording();
    }
  }, [isVoiceMode, ws.callStatus, vad.isRecording]);

  // Send text (Push-to-Talk / Chat-to-Voice)
  const sendText = useCallback((text: string) => {
    ws.sendText(text);
  }, [ws.sendText]);

  // End call
  const endCall = useCallback(() => {
    vad.stopRecording();
    ws.endCall();
  }, [vad.stopRecording, ws.endCall]);

  return {
    // Connection
    isConnected: ws.isConnected,
    callStatus: ws.callStatus,

    // Transcripts
    transcripts: ws.transcripts,

    // VAD
    vadState: vad.vadState,
    isRecording: vad.isRecording,
    isRecipientSpeaking,

    // Actions
    sendText,
    endCall,
    startRecording: vad.startRecording,
    stopRecording: vad.stopRecording,
  };
}
