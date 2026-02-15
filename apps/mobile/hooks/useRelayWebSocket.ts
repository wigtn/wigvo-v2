import { useRef, useCallback, useEffect, useState } from 'react';

type Language = 'en' | 'ko';
type CallStatus = string;

interface ServerMessage {
  type: string;
  text?: string;
  audio?: string;
  language?: Language;
  timestamp?: number;
  status?: CallStatus;
  message?: string;
  remainingMs?: number;
  code?: string;
  source?: string;
  level?: number;
  original?: string;
  corrected?: string;
  gapMs?: number;
}

interface TranscriptEntry {
  id: string;
  role: 'user' | 'recipient';
  text: string;
  language: Language;
  isTranslation: boolean;
  timestamp: number;
}

interface UseRelayWebSocketOptions {
  callId: string;
  relayWsUrl: string;
  onCallStatusChange?: (status: CallStatus) => void;
  onError?: (code: string, message: string) => void;
  onWarning?: (message: string, remainingMs: number) => void;
  onRecipientAudio?: (audioBase64: string) => void;
  onInterrupt?: (source: 'recipient' | 'user') => void;
}

export function useRelayWebSocket(options: UseRelayWebSocketOptions) {
  const {
    callId,
    relayWsUrl,
    onCallStatusChange,
    onError,
    onWarning,
    onRecipientAudio,
    onInterrupt,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [callStatus, setCallStatus] = useState<CallStatus>('pending');

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(relayWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('[RelayWS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data as string);
        handleServerMessage(message);
      } catch (err) {
        console.error('[RelayWS] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[RelayWS] Disconnected');
    };

    ws.onerror = (event) => {
      console.error('[RelayWS] Error:', event);
    };
  }, [relayWsUrl]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    const now = message.timestamp ?? Date.now();
    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;

    switch (message.type) {
      case 'transcript.user':
        setTranscripts((prev) => [
          ...prev,
          { id, role: 'user', text: message.text!, language: message.language!, isTranslation: false, timestamp: now },
        ]);
        break;

      case 'transcript.user.translated':
        setTranscripts((prev) => [
          ...prev,
          { id, role: 'user', text: message.text!, language: message.language!, isTranslation: true, timestamp: now },
        ]);
        break;

      case 'transcript.recipient':
        setTranscripts((prev) => [
          ...prev,
          { id, role: 'recipient', text: message.text!, language: message.language!, isTranslation: false, timestamp: now },
        ]);
        break;

      case 'transcript.recipient.translated':
        setTranscripts((prev) => [
          ...prev,
          { id, role: 'recipient', text: message.text!, language: message.language!, isTranslation: true, timestamp: now },
        ]);
        break;

      case 'audio.recipient.translated':
        onRecipientAudio?.(message.audio!);
        break;

      case 'call.status':
        setCallStatus(message.status!);
        onCallStatusChange?.(message.status!);
        break;

      case 'call.warning':
        onWarning?.(message.message!, message.remainingMs!);
        break;

      case 'interrupt.detected':
        onInterrupt?.(message.source as 'recipient' | 'user');
        break;

      case 'error':
        onError?.(message.code!, message.message!);
        break;
    }
  }, [onCallStatusChange, onError, onWarning, onRecipientAudio, onInterrupt]);

  // Send audio chunk (Client VAD)
  const sendAudioChunk = useCallback((audioBase64: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'audio.chunk',
      audio: audioBase64,
      timestamp: Date.now(),
    }));
  }, []);

  // Commit audio (end of speech)
  const commitAudio = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'audio.commit',
      timestamp: Date.now(),
    }));
  }, []);

  // Send text (Push-to-Talk)
  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'text.send',
      text,
    }));
  }, []);

  // End call
  const endCall = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'call.end' }));
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    callStatus,
    transcripts,
    sendAudioChunk,
    commitAudio,
    sendText,
    endCall,
  };
}
